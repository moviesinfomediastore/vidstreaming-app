import { useState, useEffect } from 'react';
import { Lock, Shield, Zap, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaywallOverlayProps {
  videoTitle: string;
  price: number;
  durationMinutes: number;
  onPaymentRequest: () => void;
  isProcessing: boolean;
}

export default function PaywallOverlay({
  videoTitle,
  price,
  durationMinutes,
  onPaymentRequest,
  isProcessing,
}: PaywallOverlayProps) {
  const [countdown, setCountdown] = useState(3);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    } else {
      setShowPaywall(true);
      // Trigger entrance animation
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, [countdown]);

  if (!showPaywall) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-20 rounded-xl">
        <div className="text-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-accent flex items-center justify-center mx-auto mb-3">
            <span className="text-4xl sm:text-5xl font-bold text-accent font-heading">{countdown}</span>
          </div>
          <p className="text-white/70 text-base sm:text-lg">Preview ended</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-20 rounded-xl p-4">
      <div
        className={`bg-card/98 backdrop-blur-xl rounded-2xl p-5 sm:p-6 w-full max-w-[380px] shadow-2xl border border-border/50 transition-all duration-500 ${
          isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}
      >
        {/* Header */}
        <div className="text-center mb-4 sm:mb-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-foreground font-heading">
            Unlock Full Video
          </h3>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1 line-clamp-1">{videoTitle}</p>
        </div>

        {/* Price Card */}
        <div className="bg-muted/80 rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground text-xs sm:text-sm">Video length</span>
            <span className="font-medium text-foreground text-xs sm:text-sm">{durationMinutes} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs sm:text-sm">One-time price</span>
            <span className="font-bold text-foreground text-xl sm:text-2xl">${price.toFixed(2)}</span>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onPaymentRequest}
          disabled={isProcessing}
          className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl shadow-lg"
          style={{ background: 'var(--gradient-accent)' }}
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
              Redirecting to PayPal...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Pay ${price.toFixed(2)} with PayPal
            </span>
          )}
        </Button>

        {/* Disclosure */}
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-3 leading-relaxed">
          Instant access after payment. By purchasing you agree to our terms of service.
        </p>

        {/* Trust Badges */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 mt-3 sm:mt-4 pt-3 border-t border-border/50">
          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" /> Secure Payment
          </span>
          <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent" /> Instant Access
          </span>
        </div>
      </div>
    </div>
  );
}
