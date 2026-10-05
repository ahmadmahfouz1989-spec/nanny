/**
 * Title for one section of a profile form (every category uses the same
 * style). Inside EditShell each one is numbered automatically -- see
 * .oui-form-sections in globals.css.
 */
export default function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="oui-section-heading font-display text-sm font-semibold text-muted uppercase tracking-wide">{children}</h2>
  );
}
