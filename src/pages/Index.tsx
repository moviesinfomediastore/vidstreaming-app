import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Play, Lock, Shield } from 'lucide-react';
import Footer from '@/components/Footer';

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'var(--gradient-primary)' }}>
            <Play className="w-10 h-10 text-primary-foreground ml-1" />
          </div>
          <h1 className="text-3xl font-bold font-heading text-foreground">
            Premium Video Content
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Watch exclusive videos. Pay only for what you want to see. Instant access after payment.
          </p>
          <div className="flex flex-col gap-3 items-start mx-auto w-fit">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Lock className="w-4 h-4 text-primary" />
              <span>Secure streaming with content protection</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Shield className="w-4 h-4 text-primary" />
              <span>Safe payments via PayPal</span>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="mt-4"
          >
            Admin Panel
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
