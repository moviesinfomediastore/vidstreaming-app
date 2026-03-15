import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

interface VideoPlayerProps {
  videoUrl: string;
  previewDuration: number;
  isUnlocked: boolean;
  videoId: string;
  onPreviewEnd: () => void;
  children?: React.ReactNode;
}

export default function VideoPlayer({
  videoUrl,
  previewDuration,
  isUnlocked,
  videoId,
  onPreviewEnd,
  children,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (!isUnlocked && !previewEnded && video.currentTime >= previewDuration) {
      video.pause();
      setIsPlaying(false);
      setPreviewEnded(true);

      // CRITICAL: Force kill the video source to eject iOS native player
      // If we don't do this, users can just hit play in the native OS player and bypass
      video.removeAttribute('src');
      video.load();

      // Exit fullscreen before showing paywall
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      if (fsEl) {
        const exitFn = document.exitFullscreen
          ? () => document.exitFullscreen()
          : (document as any).webkitExitFullscreen
            ? () => (document as any).webkitExitFullscreen()
            : null;
        if (exitFn) {
          Promise.resolve(exitFn()).then(() => onPreviewEnd()).catch(() => onPreviewEnd());
        } else {
          onPreviewEnd();
        }
      } else {
        onPreviewEnd();
      }

      trackEvent(videoId, 'paywall_reached', Math.floor(video.currentTime));
    }
  }, [isUnlocked, previewDuration, previewEnded, onPreviewEnd, videoId]);

  // Listen for fullscreen changes (standard + webkit for iOS)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = document.fullscreenElement
        || (document as any).webkitFullscreenElement
        || null;
      setIsFullscreen(!!fsElement);
    };

    // Also detect iOS native video fullscreen via the video element
    const video = videoRef.current;
    const handleWebkitFS = () => {
      setIsFullscreen(!!(video as any)?.webkitDisplayingFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    video?.addEventListener('webkitbeginfullscreen', () => setIsFullscreen(true));
    video?.addEventListener('webkitendfullscreen', () => setIsFullscreen(false));

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      video?.removeEventListener('webkitbeginfullscreen', handleWebkitFS);
      video?.removeEventListener('webkitendfullscreen', handleWebkitFS);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryAutoplay = async () => {
      try {
        video.muted = true;
        setIsMuted(true);
        await video.play();
        setIsPlaying(true);
        if (!hasStarted) {
          setHasStarted(true);
          trackEvent(videoId, 'play_start');
        }
      } catch {
        // Autoplay blocked
      }
    };

    // If source was removed by kill switch, ignore
    if (video.hasAttribute('src')) {
      tryAutoplay();
    }
  }, [videoUrl, videoId, hasStarted]);

  useEffect(() => {
    if (isUnlocked && previewEnded) {
      setPreviewEnded(false);
      const video = videoRef.current;
      if (video) {
        // Restore the source if it was killed by the paywall
        if (!video.hasAttribute('src')) {
          video.src = videoUrl;
          video.currentTime = previewDuration; // Start where left off
        }
        video.play();
        setIsPlaying(true);
      }
    }
  }, [isUnlocked, previewEnded, videoUrl, previewDuration]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || (previewEnded && !isUnlocked)) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
      if (!hasStarted) {
        setHasStarted(true);
        trackEvent(videoId, 'play_start');
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    const video = videoRef.current;
    const wrapper = wrapperRef.current;
    if (!video || !wrapper) return;

    // Exit fullscreen
    const fsElement = document.fullscreenElement
      || (document as any).webkitFullscreenElement;
    if (fsElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      return;
    }

    // Only allow fullscreen if unlocked or preview hasn't ended
    if (!isUnlocked && previewEnded) return;

    // Strategy: try video element fullscreen first (works best on mobile)
    // iOS Safari: only supports webkitEnterFullscreen on <video> elements
    // Android Chrome: supports requestFullscreen on any element
    try {
      if ((video as any).webkitEnterFullscreen) {
        // iOS Safari — native video fullscreen (best mobile experience)
        (video as any).webkitEnterFullscreen();
      } else if (video.requestFullscreen) {
        // Android / modern browsers — fullscreen the video directly
        await video.requestFullscreen();
      } else if (wrapper.requestFullscreen) {
        // Desktop fallback — fullscreen the wrapper div
        await wrapper.requestFullscreen();
      } else if ((wrapper as any).webkitRequestFullscreen) {
        (wrapper as any).webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const seekTo = pct * duration;
    if (!isUnlocked && seekTo >= previewDuration) return;
    video.currentTime = seekTo;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const previewPct = duration > 0 ? (previewDuration / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className="relative w-full bg-black rounded-xl overflow-hidden group"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video object-contain bg-black"
        style={{ 
          userSelect: 'none', 
          WebkitTouchCallout: 'none',
          pointerEvents: isUnlocked ? 'auto' : 'none' 
        } as React.CSSProperties}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        playsInline
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        crossOrigin="anonymous"
      />

      {/* Custom controls overlay — always visible on mobile, hover-show on desktop */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 sm:p-4 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
        {/* Progress bar */}
        <div
          className="w-full h-1.5 sm:h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 sm:mb-3 relative group/progress"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-primary rounded-full transition-all relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
          {!isUnlocked && (
            <div
              className="absolute top-0 h-full border-r-2 border-accent"
              style={{ left: `${previewPct}%` }}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={togglePlay} className="text-white hover:text-primary transition-colors p-1">
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-primary transition-colors p-1">
              {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <span className="text-white/70 text-[10px] sm:text-xs font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          {isUnlocked && (
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-primary transition-colors p-1"
            >
              {isFullscreen
                ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
                : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
              }
            </button>
          )}
        </div>
      </div>

      {/* Click to play overlay */}
      {!isPlaying && !previewEnded && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 z-[5]"
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground ml-0.5" />
          </div>
        </button>
      )}

      {/* Children (paywall overlay) rendered inside wrapper for fullscreen support */}
      {children}
    </div>
  );
}
