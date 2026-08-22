export default function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="200" cy="170" rx="180" ry="150" className="fill-primary-soft" />
      <ellipse cx="295" cy="85" rx="60" ry="50" className="fill-secondary-soft" opacity="0.8" />

      <g className="stroke-secondary/40" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M70 140 L70 190 L130 190 L130 140 L100 112 Z" />
        <rect x="90" y="160" width="20" height="30" />
      </g>

      <ellipse cx="205" cy="272" rx="90" ry="14" className="fill-ink/10" />

      {/* adult */}
      <rect x="150" y="172" width="46" height="88" rx="23" className="fill-primary" />
      <circle cx="173" cy="150" r="24" className="fill-primary" />

      {/* child */}
      <rect x="215" y="202" width="34" height="60" rx="17" className="fill-secondary" />
      <circle cx="232" cy="180" r="18" className="fill-secondary" />

      {/* holding hands */}
      <path
        d="M196 220 Q206 228 215 226"
        className="stroke-primary"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      {/* heart */}
      <path
        d="M203 100c-10-12-30-8-30 6 0 14 30 32 30 32s30-18 30-32c0-14-20-18-30-6z"
        className="fill-secondary"
      />

      <circle cx="88" cy="88" r="5" className="fill-primary" opacity="0.6" />
      <circle cx="322" cy="198" r="6" className="fill-secondary" opacity="0.5" />
      <circle cx="300" cy="248" r="4" className="fill-primary" opacity="0.7" />
    </svg>
  );
}
