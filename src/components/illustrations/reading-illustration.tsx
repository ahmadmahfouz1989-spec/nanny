export default function ReadingIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="95" rx="60" ry="10" className="fill-ink/10" />

      <rect x="30" y="45" width="34" height="50" rx="16" className="fill-primary" />
      <circle cx="47" cy="35" r="16" className="fill-primary" />

      <rect x="80" y="60" width="26" height="35" rx="13" className="fill-secondary" />
      <circle cx="93" cy="52" r="13" className="fill-secondary" />

      <g transform="rotate(-4 83 81)">
        <rect x="58" y="74" width="50" height="14" rx="3" className="fill-surface" />
        <line x1="83" y1="74" x2="83" y2="88" className="stroke-border" strokeWidth="2" />
      </g>
    </svg>
  );
}
