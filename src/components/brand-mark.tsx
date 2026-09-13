import { Link } from "@/i18n/navigation";

export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 ${className}`}>
      {/* Two profiles overlapping into a match, checked where they meet. */}
      <svg width="32" height="32" viewBox="0 0 40 40" className="shrink-0" aria-hidden="true">
        <circle cx="16" cy="20" r="11" fill="var(--primary)" />
        <circle cx="24" cy="20" r="11" fill="var(--accent)" />
        <path
          d="M13 20.5 L18 25.5 L27 14.5"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-brand text-xl font-bold tracking-tight text-ink">ouiKnow</span>
    </Link>
  );
}
