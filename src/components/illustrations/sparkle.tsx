export default function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0l2.3 9.7L24 12l-9.7 2.3L12 24l-2.3-9.7L0 12l9.7-2.3z" />
    </svg>
  );
}
