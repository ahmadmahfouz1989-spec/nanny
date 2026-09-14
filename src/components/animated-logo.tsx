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
 * `fullHeight` fills the rest of the content pane and centers within it —
 * for a page's initial load, where otherwise the mark sits right under the
 * heading with a wall of empty space below it until content arrives.
 */
export function LogoLoader({ label, fullHeight = false }: { label?: string; fullHeight?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${fullHeight ? "min-h-[50vh]" : "py-10"}`}
    >
      <AnimatedLogo variant="pulse" size={40} />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
