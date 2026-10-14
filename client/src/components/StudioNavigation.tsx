import { Link, useLocation } from "wouter";
import { Sparkles, Send } from "lucide-react";

/** Shared studio shortcuts stay visible above workspace content. */
export function StudioNavigation() {
  const [location] = useLocation();
  return (
    <nav aria-label="Studios" className="studio-shortcuts">
      <Link
        href="/app/creatives/studio"
        aria-current={
          ["/app/creatives/studio", "/app/creatives/configurator"].includes(
            location
          )
            ? "page"
            : undefined
        }
        className="studio-shortcut studio-shortcut-create"
      >
        <Sparkles size={16} />
        <span>Creative Studio</span>
      </Link>
      <Link
        href="/app/activate/studio"
        aria-current={location === "/app/activate/studio" ? "page" : undefined}
        className="studio-shortcut studio-shortcut-activate"
      >
        <Send size={16} />
        <span>Activation Studio</span>
      </Link>
    </nav>
  );
}
