/**
 * The blue Verified check shown after a verified person's name, as on X.
 * Verified (users.featured_until in the future, granted by an admin) also
 * puts them first in match and browse lists. Sized in em, so it follows
 * the name's font size; the same blue in light and dark.
 */
export default function VerifiedCheck({ label, className = "" }: { label: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      // Without a label it's decoration (the word "Verified" is beside it).
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={`inline-block h-[1em] w-[1em] shrink-0 align-[-0.125em] ${className}`}
    >
      {label && <title>{label}</title>}
      {/* A twelve-point rosette with a white tick. */}
      <path
        fill="#1D9BF0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      <path fill="#fff" d="M10.54 16.2 6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  );
}
