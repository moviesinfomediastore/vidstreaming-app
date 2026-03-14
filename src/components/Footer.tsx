import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-border/50 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/refund" className="hover:text-foreground transition-colors">Refunds</Link>
          <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
          © {new Date().getFullYear()} Vidstreaming. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
