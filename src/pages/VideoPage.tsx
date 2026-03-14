import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { getSessionToken, setSessionToken } from '@/lib/visitor';
import VideoPlayer from '@/components/VideoPlayer';
import PaywallOverlay from '@/components/PaywallOverlay';
import Footer from '@/components/Footer';
import { Clock, DollarSign, CheckCircle, Play, Eye, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Video {
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
  chunk_count: number | null;
  total_bytes: number | null;
  chunk_prefix: string | null;
}

export default function VideoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0);

  // Handle PayPal return callback
  useEffect(() => {
    const token = searchParams.get('token');
    const cancelled = searchParams.get('cancelled');

    if (cancelled) {
      toast({
        title: 'Payment Cancelled',
        description: 'You cancelled the payment. You can try again anytime.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', `/video/${slug}`);
      return;
    }

    if (token && slug) {
      handlePayPalCapture(token);
    }
  }, [searchParams, slug]);

  const handlePayPalCapture = async (orderId: string) => {
    setIsProcessing(true);
    try {
      const { data: videoData } = await supabase
        .from('videos')
        .select('*')
        .eq('slug', slug!)
        .eq('is_published', true)
        .single();

      if (!videoData) {
        toast({ title: 'Error', description: 'Video not found.', variant: 'destructive' });
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const captureRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/capture-paypal-payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, videoId: videoData.id }),
        }
      );
      const result = await captureRes.json();

      if (result.success && result.sessionToken) {
        setSessionToken(videoData.id, result.sessionToken);
        setIsUnlocked(true);
        setShowPaywall(false);
        setPaymentSuccess(true);
        trackEvent(videoData.id, 'payment_completed');

        toast({
          title: '✅ Payment Successful',
          description: 'Your video is now unlocked. Enjoy!',
        });

        const fullUrl = await getSignedUrl(videoData.video_path || '', true, videoData.id, result.sessionToken);
        if (fullUrl) setVideoUrl(fullUrl);

        setTimeout(() => setPaymentSuccess(false), 5000);
      } else {
        toast({
          title: 'Payment Error',
          description: result.error || 'Payment could not be completed.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Payment Error',
        description: 'Something went wrong processing your payment.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      window.history.replaceState({}, '', `/video/${slug}`);
    }
  };

  // Fetch video data
  useEffect(() => {
    if (!slug) return;
    const token = searchParams.get('token');
    if (token) return;

    const fetchVideo = async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setVideo(data as unknown as Video);
      trackEvent(data.id, 'page_visit');

      // Fetch social proof counts
      const { data: events } = await supabase
        .from('video_analytics')
        .select('event_type')
        .eq('video_id', data.id);
      if (events) {
        setViewCount(events.filter(e => e.event_type === 'page_visit').length);
        setPurchaseCount(events.filter(e => e.event_type === 'payment_completed').length);
      }

      // Check existing session
      const sessionToken = getSessionToken(data.id);
      if (sessionToken) {
        const fullUrl = await getSignedUrl(data.video_path || '', true, data.id, sessionToken, data as unknown as Video);
        if (fullUrl) {
          setVideoUrl(fullUrl);
          setIsUnlocked(true);
        } else {
          const previewUrl = await getSignedUrl(data.video_path || '', false, data.id, undefined, data as unknown as Video);
          setVideoUrl(previewUrl);
        }
      } else {
        const previewUrl = await getSignedUrl(data.video_path || '', false, data.id, undefined, data as unknown as Video);
        setVideoUrl(previewUrl);
      }
      setLoading(false);
    };
    fetchVideo();
  }, [slug, searchParams]);

  // Also fetch video on PayPal callback
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || !slug) return;

    const fetchVideoForCallback = async () => {
      const { data } = await supabase
        .from('videos')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (data) {
        setVideo(data as unknown as Video);
        const previewUrl = await getSignedUrl(data.video_path || '', false, data.id, undefined, data as unknown as Video);
        setVideoUrl(previewUrl);
        setLoading(false);
      }
    };
    fetchVideoForCallback();
  }, [slug, searchParams]);

  const getSignedUrl = async (_path: string, fullAccess: boolean, videoId: string, sessionToken?: string, videoData?: Video | null): Promise<string | null> => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      // For chunked videos, use stream-video Edge Function
      const v = videoData || video;
      if (v && v.chunk_count && v.chunk_prefix) {
        const params = new URLSearchParams({ id: videoId, access: fullAccess ? 'full' : 'preview' });
        if (sessionToken) params.set('token', sessionToken);
        return `https://${projectId}.supabase.co/functions/v1/stream-video?${params.toString()}`;
      }

      // Legacy: use get-video-access for single-file videos
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/get-video-access`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, sessionToken, fullAccess }),
        }
      );
      const result = await response.json();
      if (result.url) {
        if (!fullAccess && result.expiresIn) {
          const refreshMs = Math.max((result.expiresIn - 15) * 1000, 10000);
          setTimeout(async () => {
            const freshUrl = await getSignedUrl(_path, false, videoId);
            if (freshUrl) setVideoUrl(freshUrl);
          }, refreshMs);
        }
        return result.url;
      }
      return null;
    } catch {
      console.error('Failed to get video access URL');
      return null;
    }
  };

  const handlePaymentRequest = async () => {
    if (!video) return;
    setIsProcessing(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const createRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-paypal-order`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id, slug: video.slug }),
        }
      );
      const orderData = await createRes.json();

      if (orderData.approvalUrl) {
        window.location.href = orderData.approvalUrl;
        return;
      } else if (orderData.demo) {
        const sessionToken = crypto.randomUUID();
        setSessionToken(video.id, sessionToken);
        setIsUnlocked(true);
        setShowPaywall(false);
        setPaymentSuccess(true);
        trackEvent(video.id, 'payment_completed');

        toast({
          title: '✅ Demo Payment Successful',
          description: 'PayPal is not configured. Video unlocked in demo mode.',
        });

        const fullUrl = await getSignedUrl(video.video_path || '', true, video.id, sessionToken);
        if (fullUrl) setVideoUrl(fullUrl);

        setTimeout(() => setPaymentSuccess(false), 5000);
      } else {
        toast({
          title: 'Payment Error',
          description: orderData.error || 'Could not create payment.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Payment Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold text-foreground mb-2 font-heading">Video Not Found</h1>
        <p className="text-muted-foreground">This video doesn't exist or has been removed.</p>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 w-full">
        {/* Video player — centered with padding on all devices */}
        <div className="w-full max-w-5xl mx-auto">
          <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
            {videoUrl && (
              <VideoPlayer
                videoUrl={videoUrl}
                previewDuration={video.preview_duration_seconds}
                isUnlocked={isUnlocked}
                videoId={video.id}
                onPreviewEnd={() => setShowPaywall(true)}
              >
                {showPaywall && !isUnlocked && (
                  <PaywallOverlay
                    videoTitle={video.title}
                    price={video.price}
                    durationMinutes={video.duration_minutes || 0}
                    onPaymentRequest={handlePaymentRequest}
                    isProcessing={isProcessing}
                  />
                )}
              </VideoPlayer>
            )}
          </div>
        </div>

        {/* Content section */}
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-4">
          {/* Success banner */}
          {paymentSuccess && (
            <div className="bg-success/10 border border-success/20 rounded-xl p-3.5 flex items-center gap-3 animate-fade-in-up">
              <CheckCircle className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium text-foreground">
                Payment successful! Your video is now unlocked — enjoy.
              </p>
            </div>
          )}

          {/* Title */}
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground font-heading leading-snug">
            {video.title}
          </h1>

          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {viewCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
                <Eye className="w-3.5 h-3.5" />
                {viewCount.toLocaleString()} {viewCount === 1 ? 'view' : 'views'}
              </span>
            )}
            {purchaseCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success">
                <Users className="w-3.5 h-3.5" />
                {purchaseCount.toLocaleString()} {purchaseCount === 1 ? 'purchase' : 'purchases'}
              </span>
            )}
            {video.duration_minutes && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                {video.duration_minutes} min
              </span>
            )}
            {!isUnlocked && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-semibold">
                <DollarSign className="w-3.5 h-3.5" />
                ${video.price.toFixed(2)}
              </span>
            )}
            {isUnlocked && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Unlocked
              </span>
            )}
          </div>

          {/* Description */}
          {video.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              {video.description}
            </p>
          )}

          {/* CTA card for non-paying users */}
          {!isUnlocked && !showPaywall && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-5 max-w-md">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--gradient-accent)' }}>
                  <Play className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Watch the preview</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Preview plays automatically. Unlock the full video for ${video.price.toFixed(2)}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
