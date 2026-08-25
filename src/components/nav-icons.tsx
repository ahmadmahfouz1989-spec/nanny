export function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        d="M4 5.5h16v10H9l-4 3.5v-3.5H4v-10Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="8" r="3.3" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" />
    </svg>
  );
}

export function AdminIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        d="M12 3.5 5 6v5.5c0 4.3 2.9 8 7 9 4.1-1 7-4.7 7-9V6l-7-2.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
