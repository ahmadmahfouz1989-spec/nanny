import Image from "next/image";
import brandMark from "../../public/images/brand-mark.png";

/**
 * The brand mark with motion — "pulse" for an ongoing loading state,
 * "pop" for a one-time first-appearance moment (e.g. the landing hero).
 * Both respect prefers-reduced-motion via the .oui-logo-* classes in
 * globals.css.
 */
export function AnimatedLogo({
  variant = "pulse",
  size = 40,
  className = "",
}: {
  variant?: "pulse" | "pop";
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={brandMark}
      alt=""
      width={size}
      height={size}
      className={`${variant === "pulse" ? "oui-logo-pulse" : "oui-logo-pop"} ${className}`}
    />
  );
}

/**
 * Drop-in replacement for a plain "Loading…" line, anywhere in the app.
 * `fullHeight` grows to fill whatever vertical space its flex parent gives
 * it and centers within that — for a page's initial load. The parent must
 * itself be a flex column with real height (e.g. `min-h-screen flex
 * flex-col`) while loading, or `flex-1` has nothing to grow into and this
 * collapses back to the same "stuck under the heading" look it's meant to
 * fix.
 */
export function LogoLoader({ label, fullHeight = false }: { label?: string; fullHeight?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${fullHeight ? "flex-1" : "py-10"}`}>
      <AnimatedLogo variant="pulse" size={40} />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
