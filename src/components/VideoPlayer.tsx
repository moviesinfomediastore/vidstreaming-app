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

      // Exit fullscreen before showing paywall
      if (document.fullscreenElement) {
        document.exitFullscreen().then(() => {
          onPreviewEnd();
        }).catch(() => {
          onPreviewEnd();
        });
      } else {
        onPreviewEnd();
      }

      trackEvent(videoId, 'paywall_reached', Math.floor(video.currentTime));
    }
  }, [isUnlocked, previewDuration, previewEnded, onPreviewEnd, videoId]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
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

    tryAutoplay();
  }, [videoUrl, videoId, hasStarted]);

  useEffect(() => {
    if (isUnlocked && previewEnded) {
      setPreviewEnded(false);
      const video = videoRef.current;
      if (video) {
        video.play();
        setIsPlaying(true);
      }
    }
  }, [isUnlocked, previewEnded]);

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

  const toggleFullscreen = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      // Only allow fullscreen if unlocked or preview hasn't ended
      if (!isUnlocked && previewEnded) return;
      wrapper.requestFullscreen();
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
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onContextMenu={(e) => e.preventDefault()}
        playsInline
        controlsList="nodownload"
        disablePictureInPicture
      />

      {/* Custom controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 sm:p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {/* Progress bar */}
        <div
          className="w-full h-1 sm:h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 sm:mb-3 relative group/progress"
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
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-primary transition-colors p-1"
            disabled={!isUnlocked && previewEnded}
          >
            {isFullscreen
              ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
              : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
            }
          </button>
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
