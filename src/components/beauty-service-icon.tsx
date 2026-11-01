import { CrownIcon, DotsIcon, FaceIcon, LashIcon, LipstickIcon, NailPolishIcon, ScissorsIcon, StonesIcon, WaxIcon } from "@/components/home-icons";
import type { BeautyService } from "@/lib/validation/beauty";

// Each beauty service's icon and color, shared by the request form's
// service list and the provider form.
export const BEAUTY_LOOK: Record<BeautyService, { Icon: (p: { className?: string }) => React.ReactNode; circle: string }> = {
  hair: { Icon: ScissorsIcon, circle: "bg-rose-soft text-rose" },
  nails: { Icon: NailPolishIcon, circle: "bg-berry-soft text-berry" },
  makeup: { Icon: LipstickIcon, circle: "bg-primary-soft text-primary" },
  skin: { Icon: FaceIcon, circle: "bg-secondary-soft text-secondary" },
  massage: { Icon: StonesIcon, circle: "bg-sky-soft text-sky-ink" },
  hair_removal: { Icon: WaxIcon, circle: "bg-accent-soft text-accent-hover" },
  lashes_brows: { Icon: LashIcon, circle: "bg-rose-soft text-rose" },
  bridal: { Icon: CrownIcon, circle: "bg-accent-soft text-accent-hover" },
  other: { Icon: DotsIcon, circle: "bg-surface-sunken text-muted" },
};

export default function BeautyServiceIcon({ service, className = "h-11 w-11" }: { service: BeautyService; className?: string }) {
  const { Icon, circle } = BEAUTY_LOOK[service];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${circle} ${className}`}>
      <Icon className="h-[55%] w-[55%]" />
    </span>
  );
}
