export default function WaveDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      className={`absolute bottom-0 left-0 w-full h-16 sm:h-20 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M0,40 C240,90 480,0 720,30 C960,60 1200,10 1440,50 L1440,100 L0,100 Z"
        fill="currentColor"
      />
    </svg>
  );
}
