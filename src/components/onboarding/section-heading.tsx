/** Title for one section of a profile form (every category uses the same style). */
export default function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-sm font-semibold text-muted uppercase tracking-wide">{children}</h2>;
}
