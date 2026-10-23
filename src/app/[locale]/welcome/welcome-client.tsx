"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LOOK } from "@/components/category-look";
import { DotsIcon, PersonIcon, ProviderIcon } from "@/components/home-icons";
import { ui } from "@/lib/ui";

type Service = { slug: string; icon: string; name: string };

export default function WelcomeClient({ categories, title }: { categories: Service[]; title: string }) {
  const t = useTranslations("Welcome");
  const [side, setSide] = useState<"seeker" | "provider" | null>(null);

  if (!side) {
    return (
      <>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{t("subtitle")}</p>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setSide("seeker")} className={ui.cardHover + " flex items-center gap-4 p-5 text-start"}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <PersonIcon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold">{t("need")}</span>
              <span className="block text-sm text-muted">{t("needBody")}</span>
            </span>
          </button>
          <button type="button" onClick={() => setSide("provider")} className={ui.cardHover + " flex items-center gap-4 p-5 text-start"}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
              <ProviderIcon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold">{t("offer")}</span>
              <span className="block text-sm text-muted">{t("offerBody")}</span>
            </span>
          </button>
        </div>
        <Link href="/feed" className={ui.link + " mt-6 inline-block text-sm"}>
          {t("skip")}
        </Link>
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setSide(null)} className={ui.link + " mb-3 text-sm"}>
        {t("back")}
      </button>
      <h1 className="font-display text-2xl font-bold">{side === "seeker" ? t("whichNeed") : t("whichOffer")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t("whichBody")}</p>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((c) => {
          const look = LOOK[c.slug] ?? { Icon: DotsIcon, card: "bg-sky-soft/70", circle: "bg-sky-soft text-sky-ink" };
          return (
            <Link
              key={c.slug}
              href={`/categories/${c.slug}/onboarding?role=${side}`}
              className={`flex flex-col gap-3 rounded-2xl p-4 transition active:scale-[0.98] ${look.card}`}
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${look.circle}`}>
                <look.Icon className="h-6 w-6" />
              </span>
              <span className="font-display font-bold leading-tight text-ink">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
