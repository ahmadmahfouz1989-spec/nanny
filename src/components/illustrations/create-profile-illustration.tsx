export default function CreateProfileIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 110" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="120" height="90" rx="20" className="fill-primary-soft" />
      <rect x="45" y="22" width="60" height="64" rx="10" className="fill-surface" />
      <circle cx="75" cy="45" r="12" className="fill-primary" />
      <rect x="58" y="64" width="34" height="6" rx="3" className="fill-border" />
      <rect x="58" y="75" width="24" height="6" rx="3" className="fill-border" />
      <circle cx="100" cy="30" r="14" className="fill-secondary" />
      <path
        d="M94 30l4 4 8-8"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
