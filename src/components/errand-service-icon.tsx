import { BagIcon, BoxIcon, ClockIcon, DocumentIcon, MotoIcon } from "@/components/home-icons";
import type { ErrandService } from "@/lib/validation/errands";

// Each Delivery & Errands service's icon and color, shared by the request
// form's service list and the provider form.
export const ERRAND_LOOK: Record<ErrandService, { Icon: (p: { className?: string }) => React.ReactNode; circle: string }> = {
  delivery: { Icon: BoxIcon, circle: "bg-accent-soft text-accent-hover" },
  paperwork: { Icon: DocumentIcon, circle: "bg-berry-soft text-berry" },
  queue: { Icon: ClockIcon, circle: "bg-sky-soft text-sky-ink" },
  shopping: { Icon: BagIcon, circle: "bg-primary-soft text-primary" },
  moto_taxi: { Icon: MotoIcon, circle: "bg-success-soft text-success" },
};

export default function ErrandServiceIcon({ service, className = "h-11 w-11" }: { service: ErrandService; className?: string }) {
  const { Icon, circle } = ERRAND_LOOK[service];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${circle} ${className}`}>
      <Icon className="h-[55%] w-[55%]" />
    </span>
  );
}
