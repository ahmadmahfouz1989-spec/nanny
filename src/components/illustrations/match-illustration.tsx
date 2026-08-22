export default function MatchIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 110" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="120" height="90" rx="20" className="fill-secondary-soft" />
      <g transform="rotate(-6 43 58)">
        <rect x="20" y="30" width="46" height="56" rx="10" className="fill-surface" />
        <circle cx="43" cy="46" r="9" className="fill-secondary" />
        <rect x="30" y="62" width="26" height="5" rx="2.5" className="fill-border" />
      </g>
      <g transform="rotate(6 97 58)">
        <rect x="74" y="30" width="46" height="56" rx="10" className="fill-surface" />
        <circle cx="97" cy="46" r="9" className="fill-primary" />
        <rect x="84" y="62" width="26" height="5" rx="2.5" className="fill-border" />
      </g>
      <circle cx="70" cy="58" r="18" className="fill-primary" />
      <path
        d="M62 58l5 5 11-11"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
