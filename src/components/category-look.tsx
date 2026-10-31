import { BabyIcon, BookOpenIcon, CleanHomeIcon, NurseIcon, ScooterIcon, WrenchIcon } from "@/components/home-icons";

// How each service looks wherever services are listed (Home, the services
// page, the welcome question), and the label set search also matches
// ("math" finds Tutoring). No server imports, so client screens can use it.
export type Look = { Icon: (p: { className?: string }) => React.ReactNode; card: string; circle: string; words?: string };

export const LOOK: Record<string, Look> = {
  nanny: { Icon: BabyIcon, card: "bg-primary-soft/60", circle: "bg-primary-soft text-primary" },
  nursing: { Icon: NurseIcon, card: "bg-secondary-soft/60", circle: "bg-secondary-soft text-secondary", words: "CareSpecialties" },
  tutoring: { Icon: BookOpenIcon, card: "bg-berry-soft/60", circle: "bg-berry-soft text-berry", words: "Subjects" },
  maintenance: { Icon: WrenchIcon, card: "bg-accent-soft/70", circle: "bg-accent-soft text-accent-hover", words: "Trades" },
  errands: { Icon: ScooterIcon, card: "bg-success-soft/60", circle: "bg-success-soft text-success", words: "ErrandServices" },
  cleaning: { Icon: CleanHomeIcon, card: "bg-sky-soft/70", circle: "bg-sky-soft text-sky-ink", words: "CleaningServices" },
};

