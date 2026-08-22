export default function ConnectIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 110" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="120" height="90" rx="20" className="fill-primary-soft" />
      <rect x="35" y="35" width="66" height="42" rx="12" className="fill-surface" />
      <path d="M55 77 L45 90 L45 77 Z" className="fill-surface" />
      <rect x="58" y="54" width="20" height="16" rx="4" className="fill-secondary" />
      <path
        d="M62 54v-6a6 6 0 0 1 12 0v6"
        className="stroke-secondary"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
