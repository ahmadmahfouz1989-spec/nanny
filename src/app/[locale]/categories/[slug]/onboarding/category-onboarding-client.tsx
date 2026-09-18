"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { Link } from "@/i18n/navigation";
import NursingProviderForm from "./nursing-provider-form";
import NursingSeekerForm from "./nursing-seeker-form";
import TutoringProviderForm from "./tutoring-provider-form";
import TutoringSeekerForm from "./tutoring-seeker-form";
import { ui } from "@/lib/ui";

// Each category's form pair is registered here -- also needs a schema
// pair in CATEGORY_SCHEMAS (src/app/api/generic-profile/route.ts) and a
// SUPPORTED_SLUGS entry (../page.tsx) before it's reachable at all.
const FORMS: Record<string, { provider: typeof NursingProviderForm; seeker: typeof NursingSeekerForm }> = {
  nursing: { provider: NursingProviderForm, seeker: NursingSeekerForm },
  tutoring: { provider: TutoringProviderForm, seeker: TutoringSeekerForm },
};

type ExistingProfile = {
  id: string;
  role: "seeker" | "provider";
  full_name: string;
  location_id: string | null;
  attributes: Record<string, unknown>;
  contact_phone: string | null;
  status: string;
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
  const tw = useTranslations("Wizard");
  const [chosenRole, setChosenRole] = useState<"seeker" | "provider" | null>(
    providerProfile ? "provider" : seekerProfile ? "seeker" : null,
  );
  // Claiming (below) can hand back a brand-new draft row the server-side
  // props above don't know about yet -- these start from the props and
  // get filled in once a claim resolves.
  const [seeker, setSeeker] = useState(seekerProfile);
  const [provider, setProvider] = useState(providerProfile);
  const [claiming, setClaiming] = useState<"seeker" | "provider" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Commits to a role the moment it's picked, before any real profile
  // fields are filled in -- same reasoning as nanny's claim-role: this is
  // what lets the nav show this category right away instead of only after
  // the whole form is submitted. Re-picking a role that's already claimed
  // (or fully onboarded) just reuses that same row -- never overwrites it.
  async function chooseRole(role: "seeker" | "provider") {
    if (role === "seeker" && seeker) return setChosenRole("seeker");
    if (role === "provider" && provider) return setChosenRole("provider");

    setClaiming(role);
    setError(null);
    const res = await fetch("/api/generic-profile/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorySlug, role }),
    });
    setClaiming(null);

    if (!res.ok) {
      setError(tw("genericError"));
      return;
    }

    const { profile } = await res.json();
    const withContact = { ...profile, contact_phone: null } as NonNullable<ExistingProfile>;
    if (role === "seeker") setSeeker(withContact);
    else setProvider(withContact);
    setChosenRole(role);
  }

  const forms = FORMS[categorySlug];

  if (chosenRole === "provider" && forms) {
    const ProviderForm = forms.provider;
    return <ProviderForm categorySlug={categorySlug} initialProfile={provider} />;
  }
  if (chosenRole === "seeker" && forms) {
    const SeekerForm = forms.seeker;
    return <SeekerForm categorySlug={categorySlug} initialProfile={seeker} />;
  }

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <div className="flex items-center gap-5">
          <BrandMark />
          <Link href="/categories" className={ui.link + " text-sm"}>
            {t("backToCategories")}
          </Link>
        </div>
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
              <button
                type="button"
                onClick={() => chooseRole("seeker")}
                disabled={claiming !== null}
                className={ui.cardHover + " p-5 text-start"}
              >
                {/* Per-category key, e.g. "nursing.roleSeekerTitle" -- see the nested entries in CategoryOnboarding */}
                <p className="font-display font-semibold mb-1">{t(`${categorySlug}.roleSeekerTitle`)}</p>
                <p className="text-sm text-muted">{t(`${categorySlug}.roleSeekerDescription`)}</p>
              </button>
              <button
                type="button"
                onClick={() => chooseRole("provider")}
                disabled={claiming !== null}
                className={ui.cardHover + " p-5 text-start"}
              >
                <p className="font-display font-semibold mb-1">{t(`${categorySlug}.roleProviderTitle`)}</p>
                <p className="text-sm text-muted">{t(`${categorySlug}.roleProviderDescription`)}</p>
              </button>
            </div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-4">{error}</p>}
          </div>
        </div>
      </main>
    </>
  );
}
