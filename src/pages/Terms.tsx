import Footer from '@/components/Footer';

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold font-heading mb-6">Terms of Service</h1>
        <div className="prose prose-sm text-muted-foreground space-y-4">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-lg font-semibold text-foreground">Digital Content Purchase</h2>
          <p>By purchasing a video on this platform, you are buying a one-time digital access to view the video content. Access is provided instantly after payment is confirmed.</p>
          <h2 className="text-lg font-semibold text-foreground">Usage Rights</h2>
          <p>Purchased videos are for personal viewing only. You may not download, redistribute, copy, or share the video content. Screen recording or capturing of the content is prohibited.</p>
          <h2 className="text-lg font-semibold text-foreground">Payment</h2>
          <p>All payments are processed securely through PayPal. Prices are displayed clearly before purchase. By completing a purchase, you acknowledge that you are buying digital content.</p>
          <h2 className="text-lg font-semibold text-foreground">Account</h2>
          <p>No account creation is required. Video access is tied to your browser session after payment.</p>
          <h2 className="text-lg font-semibold text-foreground">Modifications</h2>
          <p>We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
