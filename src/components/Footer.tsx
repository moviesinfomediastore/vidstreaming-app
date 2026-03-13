import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card py-6 mt-auto">
      <div className="max-w-2xl mx-auto px-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        <span>·</span>
        <Link to="/refund" className="hover:text-foreground transition-colors">Refund Policy</Link>
        <span>·</span>
        <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
      </div>
    </footer>
  );
}
