import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { getSessionToken, setSessionToken } from '@/lib/visitor';
import VideoPlayer from '@/components/VideoPlayer';
import PaywallOverlay from '@/components/PaywallOverlay';
import Footer from '@/components/Footer';
import { Clock, DollarSign, CheckCircle, Play } from 'lucide-react';
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

  // Handle PayPal return callback
  useEffect(() => {
    const token = searchParams.get('token'); // PayPal order ID
    const cancelled = searchParams.get('cancelled');

    if (cancelled) {
      toast({
        title: 'Payment Cancelled',
        description: 'You cancelled the payment. You can try again anytime.',
        variant: 'destructive',
      });
      // Clean URL
      window.history.replaceState({}, '', `/video/${slug}`);
      return;
    }

    if (token && slug) {
      // Capture payment from PayPal return
      handlePayPalCapture(token);
    }
  }, [searchParams, slug]);

  const handlePayPalCapture = async (orderId: string) => {
    setIsProcessing(true);
    try {
      // We need the video data first
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

        // Get full video URL
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
      // Clean URL
      window.history.replaceState({}, '', `/video/${slug}`);
    }
  };

  // Fetch video data
  useEffect(() => {
    if (!slug) return;
    // Don't re-fetch if we're handling a PayPal callback (token present)
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
        // Auto-refresh preview URLs before they expire (60s expiry, refresh at 45s)
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
      // Do NOT fall back to client-side signed URLs — that bypasses payment validation
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
        // Redirect to PayPal (standard redirect flow)
        window.location.href = orderData.approvalUrl;
        return; // Don't setIsProcessing(false) since we're navigating away
      } else if (orderData.demo) {
        // Demo mode: simulate successful payment
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
        {/* Video Section - full width on mobile, constrained on desktop */}
        <div className="w-full max-w-5xl mx-auto">
          <div className="sm:px-4 lg:px-6 sm:pt-4 lg:pt-6">
            {videoUrl && (
              <VideoPlayer
                videoUrl={videoUrl}
                previewDuration={video.preview_duration_seconds}
                isUnlocked={isUnlocked}
                videoId={video.id}
                onPreviewEnd={() => setShowPaywall(true)}
              >
                {/* Paywall rendered inside VideoPlayer wrapper for fullscreen support */}
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

        {/* Video Info Section */}
        <div className="max-w-5xl mx-auto w-full px-4 lg:px-6 py-4 sm:py-6">
          {/* Payment success banner */}
          {paymentSuccess && (
            <div className="mb-4 bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium text-foreground">
                Payment successful! Your video is now unlocked — enjoy watching.
              </p>
            </div>
          )}

          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground font-heading leading-tight">
            {video.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 sm:mt-3 text-sm text-muted-foreground">
            {video.duration_minutes && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {video.duration_minutes} min
              </span>
            )}
            {!isUnlocked && (
              <span className="flex items-center gap-1.5 text-accent font-semibold">
                <DollarSign className="w-4 h-4" />
                ${video.price.toFixed(2)}
              </span>
            )}
            {isUnlocked && (
              <span className="flex items-center gap-1.5 text-success font-medium">
                <CheckCircle className="w-4 h-4" />
                Unlocked
              </span>
            )}
          </div>

          {video.description && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-3 sm:mt-4 max-w-3xl">
              {video.description}
            </p>
          )}

          {/* CTA for users who haven't paid and paywall isn't showing */}
          {!isUnlocked && !showPaywall && (
            <div className="bg-card border border-border rounded-xl p-4 sm:p-5 mt-4 sm:mt-6 max-w-md">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Play className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Watch the preview</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Preview plays automatically. Unlock full video for ${video.price.toFixed(2)}.
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
