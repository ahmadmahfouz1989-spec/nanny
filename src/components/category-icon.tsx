import { BabyIcon, BookOpenIcon, NurseIcon, ScooterIcon, WrenchIcon } from "@/components/home-icons";

const PATHS: Record<string, React.ReactNode> = {
  spray: (
    <>
      <path d="M9 8h5l2 3v9H7v-9l2-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8V4h2M16 5h2M16 8h3M17 11h2" strokeLinecap="round" />
    </>
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

// The live categories draw the same icons Home's category cards do, so a
// service looks the same in the menu, on Matches and on the categories
// page. The paths above are for the rest (coming-soon categories).
const SAME_AS_HOME: Record<string, (p: { className?: string }) => React.ReactNode> = {
  heart: BabyIcon,
  hand: NurseIcon,
  book: BookOpenIcon,
  wrench: WrenchIcon,
  scooter: ScooterIcon,
};

export default function CategoryIcon({ name, className = "" }: { name: string; className?: string }) {
  const Home = SAME_AS_HOME[name];
  if (Home) return <Home className={className} />;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7}>
      {PATHS[name] ?? PATHS.sparkle}
    </svg>
  );
}
