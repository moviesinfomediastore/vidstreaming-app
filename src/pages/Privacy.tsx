import Footer from '@/components/Footer';

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold font-heading mb-6">Privacy Policy</h1>
        <div className="prose prose-sm text-muted-foreground space-y-4">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-lg font-semibold text-foreground">Information We Collect</h2>
          <p>We collect information you provide when making a purchase, including your email address and payment details processed through PayPal. We also collect anonymous usage data to improve our service.</p>
          <h2 className="text-lg font-semibold text-foreground">How We Use Your Information</h2>
          <p>Your information is used to process payments, provide access to purchased content, and improve our service. We do not sell your personal information to third parties.</p>
          <h2 className="text-lg font-semibold text-foreground">Cookies & Analytics</h2>
          <p>We use anonymous visitor identifiers stored locally to track video engagement analytics. No personally identifiable information is collected through these mechanisms.</p>
          <h2 className="text-lg font-semibold text-foreground">Data Security</h2>
          <p>All payments are processed securely through PayPal. We do not store credit card information on our servers.</p>
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p>For privacy inquiries, please visit our <a href="/contact" className="text-primary underline">contact page</a>.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
