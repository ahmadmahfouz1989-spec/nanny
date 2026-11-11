"use client";

/**
 * The App Store button: copies the invite code on the way out. Apple doesn't
 * carry anything through an install, so the app offers to paste it when it
 * asks "Did someone invite you?".
 */
export default function CopyCodeLink({ href, code, className, children }: { href: string; code: string; className: string; children: React.ReactNode }) {
  return (
    <a href={href} className={className} onClick={() => void navigator.clipboard?.writeText(code).catch(() => {})}>
      {children}
    </a>
  );
}
