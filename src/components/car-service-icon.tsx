import { BatteryIcon, BoltIcon, BrushIcon, ClipboardIcon, DotsIcon, DropsIcon, SnowflakeIcon, TireIcon, TowTruckIcon, WarningIcon, WrenchIcon } from "@/components/home-icons";
import type { CarService } from "@/lib/validation/car";

// Each car service's icon and color, shared by the request form's
// service list and the provider form.
export const CAR_LOOK: Record<CarService, { Icon: (p: { className?: string }) => React.ReactNode; circle: string }> = {
  mechanic: { Icon: WrenchIcon, circle: "bg-primary-soft text-primary" },
  electrical: { Icon: BoltIcon, circle: "bg-accent-soft text-accent-hover" },
  battery: { Icon: BatteryIcon, circle: "bg-secondary-soft text-secondary" },
  tires: { Icon: TireIcon, circle: "bg-surface-sunken text-ink" },
  ac: { Icon: SnowflakeIcon, circle: "bg-sky-soft text-sky-ink" },
  towing: { Icon: TowTruckIcon, circle: "bg-primary-soft text-primary" },
  roadside: { Icon: WarningIcon, circle: "bg-danger-soft text-danger" },
  body_paint: { Icon: BrushIcon, circle: "bg-berry-soft text-berry" },
  car_wash: { Icon: DropsIcon, circle: "bg-sky-soft text-sky-ink" },
  inspection: { Icon: ClipboardIcon, circle: "bg-secondary-soft text-secondary" },
  other: { Icon: DotsIcon, circle: "bg-surface-sunken text-muted" },
};

export default function CarServiceIcon({ service, className = "h-11 w-11" }: { service: CarService; className?: string }) {
  const { Icon, circle } = CAR_LOOK[service];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${circle} ${className}`}>
      <Icon className="h-[55%] w-[55%]" />
    </span>
  );
}
