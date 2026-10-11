import "../brand-art.css";
import "./auth-motion.css";

/**
 * Unauthenticated frame. Deliberately outside the app shell — no sidebar, no
 * top nav.
 *
 * This layout is intentionally thin: it owns the motion stylesheet.
 * Page-specific login/register presentation lives in AuthShell.
 *
 * Auth pages inherit the shared class-based theme so the user's light/dark
 * preference is consistent across the entire product.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
