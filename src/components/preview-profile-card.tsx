"use client";

import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import AvatarIllustration from "./illustrations/avatar-illustration";
import { DAYS } from "@/lib/validation/profile";

export default function PreviewProfileCard({
  name,
  area,
  tone,
  rateLabel,
  years,
  availableDays,
}: {
  name: string;
  area: string;
  tone: "primary" | "secondary" | "berry";
  rateLabel: string;
  years: number;
  availableDays: readonly string[];
}) {
  const t = useTranslations("Preview");
  const tDay = useTranslations("Days");

  return (
    <div className={ui.card + " overflow-hidden"}>
      <div className="relative">
        <AvatarIllustration tone={tone} className="h-32 w-full" />
        <span className="absolute top-3 end-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold text-ink">
          {t("example")}
        </span>
        <div className="absolute bottom-0 start-0 p-3">
          <p className="font-display font-bold text-white drop-shadow">{name}</p>
          <p className="text-xs text-white/90 drop-shadow">{area}</p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold mb-1">{rateLabel}</p>
        <p className="text-xs text-muted mb-3">{t("yearsExperience", { years })}</p>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((day) => (
            <div key={day} className={ui.dayChip(availableDays.includes(day))}>
              {tDay(day)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
