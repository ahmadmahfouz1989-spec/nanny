"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import NursingProviderForm from "./nursing-provider-form";
import NursingSeekerForm from "./nursing-seeker-form";
import { ui } from "@/lib/ui";

type ExistingProfile = {
  id: string;
  role: "seeker" | "provider";
  full_name: string;
  location_id: string | null;
  attributes: Record<string, unknown>;
  contact_phone: string | null;
} | null;

export default function CategoryOnboardingClient({
  categorySlug,
  categoryName,
  seekerProfile,
  providerProfile,
}: {
  categorySlug: string;
  categoryName: string;
  seekerProfile: ExistingProfile;
  providerProfile: ExistingProfile;
}) {
  const t = useTranslations("CategoryOnboarding");
  const [chosenRole, setChosenRole] = useState<"seeker" | "provider" | null>(
    providerProfile ? "provider" : seekerProfile ? "seeker" : null,
  );

  if (chosenRole === "provider") {
    return <NursingProviderForm categorySlug={categorySlug} initialProfile={providerProfile} />;
  }
  if (chosenRole === "seeker") {
    return <NursingSeekerForm categorySlug={categorySlug} initialProfile={seekerProfile} />;
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-6 pb-16">
        <div className="w-full max-w-lg">
          <div className={ui.card + " p-8"}>
            <h1 className="font-display text-2xl font-semibold mb-2">{t("roleTitle", { category: categoryName })}</h1>
            <p className="text-sm text-muted mb-6">{t("roleSubtitle")}</p>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => setChosenRole("seeker")} className={ui.cardHover + " p-5 text-start"}>
                <p className="font-display font-semibold mb-1">{t("roleSeekerTitle")}</p>
                <p className="text-sm text-muted">{t("roleSeekerDescription")}</p>
              </button>
              <button type="button" onClick={() => setChosenRole("provider")} className={ui.cardHover + " p-5 text-start"}>
                <p className="font-display font-semibold mb-1">{t("roleProviderTitle")}</p>
                <p className="text-sm text-muted">{t("roleProviderDescription")}</p>
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
