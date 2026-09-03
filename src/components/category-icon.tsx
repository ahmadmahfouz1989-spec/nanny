const PATHS: Record<string, React.ReactNode> = {
  heart: (
    <path
      d="M12 20.5C12 20.5 3.5 15 3.5 8.9 3.5 5.9 5.8 4 8.3 4c1.7 0 3.1.9 3.7 2.3C12.6 4.9 14 4 15.7 4c2.5 0 4.8 1.9 4.8 4.9 0 6.1-8.5 11.6-8.5 11.6Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  spray: (
    <>
      <path d="M9 8h5l2 3v9H7v-9l2-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8V4h2M16 5h2M16 8h3M17 11h2" strokeLinecap="round" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5V5.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19" strokeLinecap="round" />
    </>
  ),
  hand: (
    <path
      d="M8 11V6a1.5 1.5 0 0 1 3 0v4m0 0V4.5a1.5 1.5 0 0 1 3 0V10m0 0V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L6 15c-.8-1.2.9-2.7 2-1.6L8 14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  wrench: (
    <path
      d="M14.5 6a3.5 3.5 0 0 0-4.6 4.3L4 16.2 6.8 19l5.9-5.9A3.5 3.5 0 0 0 17 8.5L14.8 10 13 8.2 14.5 6Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  paw: (
    <>
      <circle cx="7.5" cy="10" r="1.6" />
      <circle cx="12" cy="7.5" r="1.6" />
      <circle cx="16.5" cy="10" r="1.6" />
      <path d="M12 12c2.5 0 4.5 1.8 4.5 4a2.5 2.5 0 0 1-4-1 2.5 2.5 0 0 1-1 0 2.5 2.5 0 0 1-4 1c0-2.2 2-4 4.5-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  sparkle: (
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

export default function CategoryIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7}>
      {PATHS[name] ?? PATHS.sparkle}
    </svg>
  );
}
