import { BoxIcon, BroomIcon, BuildingIcon, DotsIcon, HardHatIcon, SofaIcon, SparklesIcon, TankIcon, WindowIcon } from "@/components/home-icons";
import type { CleaningService } from "@/lib/validation/cleaning";

// Each cleaning service's icon and color, shared by the request form's
// service list and the provider form.
export const CLEANING_LOOK: Record<CleaningService, { Icon: (p: { className?: string }) => React.ReactNode; circle: string }> = {
  home: { Icon: BroomIcon, circle: "bg-secondary-soft text-secondary" },
  deep: { Icon: SparklesIcon, circle: "bg-accent-soft text-accent-hover" },
  move: { Icon: BoxIcon, circle: "bg-primary-soft text-primary" },
  construction: { Icon: HardHatIcon, circle: "bg-accent-soft text-accent-hover" },
  office: { Icon: BuildingIcon, circle: "bg-sky-soft text-sky-ink" },
  windows: { Icon: WindowIcon, circle: "bg-sky-soft text-sky-ink" },
  upholstery: { Icon: SofaIcon, circle: "bg-berry-soft text-berry" },
  water_tanks: { Icon: TankIcon, circle: "bg-secondary-soft text-secondary" },
  other: { Icon: DotsIcon, circle: "bg-surface-sunken text-muted" },
};

export default function CleaningServiceIcon({ service, className = "h-11 w-11" }: { service: CleaningService; className?: string }) {
  const { Icon, circle } = CLEANING_LOOK[service];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${circle} ${className}`}>
      <Icon className="h-[55%] w-[55%]" />
    </span>
  );
}
