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
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, [countdown]);

  if (!showPaywall) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-50">
        <div className="text-center animate-fade-in-up">
          <div className="w-20 h-20 rounded-full border-[3px] border-primary/80 flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
            <span className="text-4xl font-bold text-primary font-heading">{countdown}</span>
          </div>
          <p className="text-white/60 text-sm">Preview ended</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md z-50 p-0 sm:p-4">
      <div
        className={`glass border border-white/[0.08] w-full sm:max-w-[400px] sm:rounded-2xl rounded-t-2xl p-5 sm:p-7 shadow-2xl transition-all duration-500 max-h-[85vh] overflow-y-auto ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--gradient-primary)' }}>
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-foreground font-heading">
            Unlock Full Video
          </h3>
          <p className="text-muted-foreground text-xs mt-1 line-clamp-1 px-4">{videoTitle}</p>
        </div>

        {/* Price info */}
        <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-muted-foreground text-sm">Video length</span>
            <span className="font-medium text-foreground text-sm">{durationMinutes} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">One-time price</span>
            <span className="font-bold text-foreground text-2xl font-heading">${price.toFixed(2)}</span>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={onPaymentRequest}
          disabled={isProcessing}
          className="w-full h-12 text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
          style={{ background: 'var(--gradient-accent)' }}
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <p className="text-[11px] text-muted-foreground/70 text-center mt-3 leading-relaxed">
          Instant access after payment. By purchasing you agree to our{' '}
          <a href="/terms" className="underline hover:text-foreground transition-colors">terms</a>.
        </p>

        {/* Trust */}
        <div className="flex items-center justify-center gap-5 mt-4 pt-3 border-t border-white/[0.06]">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-primary" /> Secure Payment
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-accent" /> Instant Access
          </span>
        </div>
      </div>
    </div>
  );
}
