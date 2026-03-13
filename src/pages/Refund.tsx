import Footer from '@/components/Footer';

export default function Refund() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold font-heading mb-6">Refund Policy</h1>
        <div className="prose prose-sm text-muted-foreground space-y-4">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-lg font-semibold text-foreground">Digital Products</h2>
          <p>All purchases on this platform are for digital video content. Since access is provided instantly after payment, all sales are generally considered final.</p>
          <h2 className="text-lg font-semibold text-foreground">Refund Eligibility</h2>
          <p>Refunds may be considered in the following cases:</p>
          <ul className="list-disc pl-5">
            <li>Technical issues preventing video playback that cannot be resolved</li>
            <li>Duplicate charges for the same video</li>
            <li>Unauthorized transactions</li>
          </ul>
          <h2 className="text-lg font-semibold text-foreground">How to Request a Refund</h2>
          <p>To request a refund, please contact us through our <a href="/contact" className="text-primary underline">contact page</a> within 24 hours of purchase. Include your PayPal transaction ID and a description of the issue.</p>
          <h2 className="text-lg font-semibold text-foreground">Processing Time</h2>
          <p>Approved refunds will be processed within 5-7 business days through PayPal.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
