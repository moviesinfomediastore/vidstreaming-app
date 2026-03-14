import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Lock, Shield, Sparkles } from 'lucide-react';
import Footer from '@/components/Footer';

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="max-w-sm w-full text-center space-y-8 animate-fade-in-up">
          {/* Logo */}
          <div className="relative mx-auto w-fit">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center animate-pulse-glow"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Play className="w-9 h-9 text-white ml-1" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold font-heading text-foreground tracking-tight">
              Premium Video
              <span className="block bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                Content
              </span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed px-2">
              Watch exclusive videos. Pay only for what you want.
              <br className="hidden sm:block" />
              Instant access after payment.
            </p>
          </div>

          {/* Features */}
          <div className="flex flex-col gap-3 w-fit mx-auto">
            {[
              { icon: Lock, text: 'Secure streaming with protection', color: 'text-primary' },
              { icon: Shield, text: 'Safe payments via PayPal', color: 'text-primary' },
              { icon: Sparkles, text: 'Instant access after purchase', color: 'text-accent' },
            ].map(({ icon: Icon, text, color }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Admin link */}
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="mt-2 border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          >
            Admin Panel
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
