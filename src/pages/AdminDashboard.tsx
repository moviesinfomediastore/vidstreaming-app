import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Trash2, Edit2, BarChart3, Video, Eye, Play,
  DollarSign, Users, LogOut, X, Save, Upload, CheckCircle2, Link
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface VideoRecord {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  price: number;
  preview_duration_seconds: number;
  video_path: string | null;
  thumbnail_path: string | null;
  duration_minutes: number | null;
  is_published: boolean;
  created_at: string;
}

interface AnalyticsSummary {
  video_id: string;
  page_visits: number;
  play_starts: number;
  paywall_hits: number;
  payments: number;
  avg_watch: number;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/['']/g, '')           // Remove apostrophes
    .replace(/[&]/g, 'and')
    .replace(/[^\w\s-]/g, '')       // Remove non-word chars
    .trim()
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/--+/g, '-')           // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');       // Trim hyphens
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration / 60); // Convert seconds to minutes
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata'));
    };
  });
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, AnalyticsSummary>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAnalytics, setSelectedAnalytics] = useState<string | null>(null);
  const [detailedAnalytics, setDetailedAnalytics] = useState<any[]>([]);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    price: '1.99',
    preview_duration_seconds: '10',
    duration_minutes: '',
    is_published: false,
  });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Background upload state
  const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
  const [videoUploadStatus, setVideoUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadedVideoPath, setUploadedVideoPath] = useState<string | null>(null);
  const [uploadChunkMeta, setUploadChunkMeta] = useState<{ chunk_count: number; total_bytes: number; chunk_prefix: string } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const CHUNK_SIZE = 45 * 1024 * 1024; // 45MB — must match stream-video edge function

  useEffect(() => {
    if (!sessionStorage.getItem('ppv_admin')) {
      navigate('/admin');
      return;
    }
    fetchVideos();
  }, [navigate]);

  // Auto-generate slug when title changes
  const handleTitleChange = (title: string) => {
    setForm(prev => ({
      ...prev,
      title,
      slug: generateSlug(title),
    }));
  };

  // Handle video file selection: auto-extract duration + start background upload
  const handleVideoFileChange = async (file: File | null) => {
    if (!file) {
      setVideoFile(null);
      setVideoUploadStatus('idle');
      setVideoUploadProgress(0);
      setUploadedVideoPath(null);
      return;
    }
    setVideoFile(file);

    // Extract duration
    try {
      const duration = await getVideoDuration(file);
      setForm(prev => ({ ...prev, duration_minutes: duration.toFixed(1) }));
    } catch {
      toast({ title: 'Warning', description: 'Could not auto-detect video duration.', variant: 'destructive' });
    }

    // Start background upload via edge function
    startBackgroundUpload(file);
  };

  const startBackgroundUpload = async (file: File) => {
    setVideoUploadStatus('uploading');
    setVideoUploadProgress(0);
    setUploadedVideoPath(null);
    setUploadChunkMeta(null);

    const slug = form.slug || 'video-' + Date.now();
    const chunkPrefix = `${slug}-${Date.now()}/`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const adminToken = sessionStorage.getItem('ppv_admin');

      for (let i = 0; i < totalChunks; i++) {
        if (abortController.signal.aborted) throw new Error('Upload aborted');

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        const chunkName = `chunk_${String(i).padStart(4, '0')}`;
        const storagePath = `${chunkPrefix}${chunkName}`;

        // Get signed upload URL for this chunk
        const signRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-upload`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminToken, bucket: 'videos', storagePath, contentType: file.type || 'video/mp4' }),
            signal: abortController.signal,
          }
        );
        const signData = await signRes.json();
        if (signData.error) throw new Error(signData.error);

        // Upload the chunk directly to the signed URL
        const uploadRes = await fetch(signData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'video/mp4' },
          body: chunkBlob,
          signal: abortController.signal,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => uploadRes.statusText);
          throw new Error(`Chunk ${i + 1}/${totalChunks} upload failed: ${errText}`);
        }

        // Update progress
        const pct = Math.round(((i + 1) / totalChunks) * 100);
        setVideoUploadProgress(pct);
      }

      setVideoUploadStatus('done');
      setUploadedVideoPath(chunkPrefix); // Store the prefix, not a single file path
      setUploadChunkMeta({
        chunk_count: totalChunks,
        total_bytes: file.size,
        chunk_prefix: chunkPrefix,
      });
      toast({ title: 'Video uploaded', description: `Video uploaded in ${totalChunks} chunks successfully.` });
    } catch (err: any) {
      if (err.message === 'Upload aborted' || abortController.signal.aborted) return;
      setVideoUploadStatus('error');
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    }
  };

  const fetchVideos = async () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', adminToken: sessionStorage.getItem('ppv_admin') }),
        }
      );
      const data = await res.json();
      if (data.videos) {
        setVideos(data.videos);
        if (data.analytics) setAnalytics(data.analytics);
      }
    } catch {
      const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
      if (data) setVideos(data);
    }
  };

  const fetchDetailedAnalytics = async (videoId: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analytics', videoId, adminToken: sessionStorage.getItem('ppv_admin') }),
        }
      );
      const data = await res.json();
      if (data.analytics) setDetailedAnalytics(data.analytics);
    } catch {
      setDetailedAnalytics([]);
    }
    setSelectedAnalytics(videoId);
  };

  const handleSave = async () => {
    setUploading(true);
    try {
      let videoPath = uploadedVideoPath;
      let thumbnailPath: string | null = null;

      // Upload thumbnail via edge function (with compression)
      if (thumbnailFile) {
        const compressed = await compressThumbnail(thumbnailFile);
        const ext = 'webp';
        const storagePath = `${form.slug}-${Date.now()}.${ext}`;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const adminToken = sessionStorage.getItem('ppv_admin');

        // Get signed URL for thumbnail
        const signRes = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-upload`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminToken, bucket: 'thumbnails', storagePath, contentType: 'image/webp' }),
          }
        );
        const signData = await signRes.json();
        if (signData.error) throw new Error(signData.error);

        // Upload directly to signed URL
        const uploadRes = await fetch(signData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: compressed,
        });
        if (!uploadRes.ok) throw new Error('Thumbnail upload failed');
        thumbnailPath = storagePath;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: editingId ? 'update' : 'create',
            id: editingId,
            adminToken: sessionStorage.getItem('ppv_admin'),
            video: {
              title: form.title,
              slug: form.slug,
              price: parseFloat(form.price),
              preview_duration_seconds: parseInt(form.preview_duration_seconds),
              duration_minutes: form.duration_minutes ? parseFloat(form.duration_minutes) : null,
              is_published: form.is_published,
              ...(videoPath && { video_path: videoPath }),
              ...(thumbnailPath && { thumbnail_path: thumbnailPath }),
              ...(uploadChunkMeta && {
                chunk_count: uploadChunkMeta.chunk_count,
                total_bytes: uploadChunkMeta.total_bytes,
                chunk_prefix: uploadChunkMeta.chunk_prefix,
              }),
            },
          }),
        }
      );

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Copy video link to clipboard
      const videoUrl = `${window.location.origin}/video/${form.slug}`;
      await navigator.clipboard.writeText(videoUrl);

      toast({ title: 'Saved', description: `Video saved! Link copied: ${videoUrl}` });
      resetForm();
      fetchVideos();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Compress thumbnail to WebP using canvas
  const compressThumbnail = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        // Max dimensions for web thumbnail
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 450;
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = (width * MAX_HEIGHT) / height;
          height = MAX_HEIGHT;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Compression failed'));
          },
          'image/webp',
          0.8
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image'));
      };
      img.src = url;
    });
  };

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-videos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id: deleteTargetId, adminToken: sessionStorage.getItem('ppv_admin') }),
        }
      );
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Deleted', description: 'Video has been removed.' });
      fetchVideos();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete video.', variant: 'destructive' });
    } finally {
      setDeleteTargetId(null);
    }
  };

  const editVideo = (v: VideoRecord) => {
    setForm({
      title: v.title,
      slug: v.slug,
      price: v.price.toString(),
      preview_duration_seconds: v.preview_duration_seconds.toString(),
      duration_minutes: v.duration_minutes?.toString() || '',
      is_published: v.is_published,
    });
    setEditingId(v.id);
    setVideoUploadStatus('idle');
    setVideoUploadProgress(0);
    setUploadedVideoPath(null);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ title: '', slug: '', price: '1.99', preview_duration_seconds: '10', duration_minutes: '', is_published: false });
    setEditingId(null);
    setVideoFile(null);
    setThumbnailFile(null);
    setVideoUploadStatus('idle');
    setVideoUploadProgress(0);
    setUploadedVideoPath(null);
    setShowForm(false);
  };

  const logout = () => {
    sessionStorage.removeItem('ppv_admin');
    navigate('/admin');
  };

  const summary = analytics[selectedAnalytics || ''];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold font-heading flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" /> Admin Panel
          </h1>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4" /> Add Video
            </Button>
            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Video Form */}
        {showForm && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-base">
                {editingId ? 'Edit Video' : 'New Video'}
              </CardTitle>
              <Button size="icon" variant="ghost" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => handleTitleChange(e.target.value)} />
                </div>
                <div>
                  <Label>Slug (auto-generated)</Label>
                  <Input value={form.slug} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                </div>
                <div>
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <Label>Preview Duration (seconds)</Label>
                  <Input type="number" value={form.preview_duration_seconds} onChange={(e) => setForm({ ...form, preview_duration_seconds: e.target.value })} />
                </div>
                <div>
                  <Label>Duration (auto-detected)</Label>
                  <Input value={form.duration_minutes ? `${form.duration_minutes} min` : 'Select a video file'} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                  <Label>Published</Label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Video File</Label>
                  <Input type="file" accept="video/*" onChange={(e) => handleVideoFileChange(e.target.files?.[0] || null)} />
                  {videoUploadStatus === 'uploading' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Upload className="w-4 h-4 animate-pulse text-primary" />
                        <span>Uploading... {videoUploadProgress}%</span>
                      </div>
                      <Progress value={videoUploadProgress} className="h-2" />
                    </div>
                  )}
                  {videoUploadStatus === 'done' && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Video uploaded successfully</span>
                    </div>
                  )}
                  {videoUploadStatus === 'error' && (
                    <div className="text-sm text-destructive">Upload failed. Try again.</div>
                  )}
                </div>
                <div>
                  <Label>Thumbnail (auto-compressed to WebP)</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={uploading || !form.title || !form.slug || (videoFile && videoUploadStatus !== 'done')}
              >
                <Save className="w-4 h-4" /> {uploading ? 'Saving...' : 'Save Video'}
              </Button>
              {videoFile && videoUploadStatus !== 'done' && (
                <p className="text-xs text-muted-foreground">Wait for video upload to complete before saving.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Video List */}
        <div className="grid gap-3">
          {videos.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No videos yet. Click "Add Video" to get started.
            </Card>
          )}
          {videos.map((v) => {
            const a = analytics[v.id];
            return (
              <Card key={v.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{v.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${v.is_published ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {v.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">/video/{v.slug} · ${v.price} · {v.preview_duration_seconds}s preview</p>
                    {a && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {a.page_visits}</span>
                        <span className="flex items-center gap-1"><Play className="w-3 h-3" /> {a.play_starts}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {a.paywall_hits}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {a.payments}</span>
                        <span>{a.page_visits > 0 ? ((a.payments / a.page_visits) * 100).toFixed(1) : 0}% conv.</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => fetchDetailedAnalytics(v.id)}>
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      const url = `${window.location.origin}/video/${v.slug}`;
                      navigator.clipboard.writeText(url);
                      toast({ title: 'Link copied', description: url });
                    }}>
                      <Link className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => editVideo(v)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteTargetId(v.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Analytics Detail */}
        {selectedAnalytics && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-base">Analytics</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setSelectedAnalytics(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Visitors', value: summary.page_visits, icon: Eye },
                    { label: 'Play Starts', value: summary.play_starts, icon: Play },
                    { label: 'Paywall Hits', value: summary.paywall_hits, icon: Users },
                    { label: 'Payments', value: summary.payments, icon: DollarSign },
                    { label: 'Avg Watch', value: `${summary.avg_watch}s`, icon: BarChart3 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-muted rounded-xl p-3 text-center">
                      <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                      <div className="text-lg font-bold text-foreground">{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              {detailedAnalytics.length > 0 && (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={detailedAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="visits" fill="hsl(250, 65%, 55%)" />
                    <Bar dataKey="payments" fill="hsl(35, 95%, 55%)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this video? This action cannot be undone.
              The video file and thumbnail will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
