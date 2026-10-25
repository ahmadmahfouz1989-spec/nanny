"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import NannyProviderForm from "./nanny-provider-form";
import NannySeekerForm from "./nanny-seeker-form";
import NursingProviderForm from "./nursing-provider-form";
import NursingSeekerForm from "./nursing-seeker-form";
import TutoringProviderForm from "./tutoring-provider-form";
import TutoringSeekerForm from "./tutoring-seeker-form";
import MaintenanceProviderForm from "./maintenance-provider-form";
import MaintenanceSeekerForm from "./maintenance-seeker-form";
import ErrandsProviderForm from "./errands-provider-form";
import ErrandsSeekerForm from "./errands-seeker-form";
import { ChevronIcon, PersonIcon, ProviderIcon } from "@/components/home-icons";
import { request } from "@/lib/request";

// Each category's form pair is registered here -- also needs a schema
// pair in CATEGORY_SCHEMAS (src/app/api/generic-profile/route.ts) and a
// CATEGORY_SLUGS entry (src/lib/category-slugs.ts) before it's reachable at all.
const FORMS: Record<string, { provider: typeof NursingProviderForm; seeker: typeof NursingSeekerForm }> = {
  nanny: { provider: NannyProviderForm, seeker: NannySeekerForm },
  nursing: { provider: NursingProviderForm, seeker: NursingSeekerForm },
  tutoring: { provider: TutoringProviderForm, seeker: TutoringSeekerForm },
  maintenance: { provider: MaintenanceProviderForm, seeker: MaintenanceSeekerForm },
  errands: { provider: ErrandsProviderForm, seeker: ErrandsSeekerForm },
};

type ExistingProfile = {
  id: string;
  role: "seeker" | "provider";
  full_name: string;
  location_id: string | null;
  attributes: Record<string, unknown>;
  contact_phone: string | null;
  status: string;
  profile_photo_url?: string | null;
} | null;

export default function CategoryOnboardingClient({
  categorySlug,
  categoryName,
  seekerProfile,
  providerProfile,
  accountContactPhone,
  initialRole,
  startRole = null,
}: {
  // Already answered elsewhere (the welcome question): claim this side on
  // arrival rather than showing the "looking or offering?" choice.
  startRole?: "seeker" | "provider" | null;
  categorySlug: string;
  categoryName: string;
  seekerProfile: ExistingProfile;
  providerProfile: ExistingProfile;
  accountContactPhone: string | null;
  // Set when arriving from a specific dashboard tab's Edit link -- takes
  // priority over the provider-first default below, which otherwise has
  // no way to know which of the two an Edit click actually meant.
  initialRole?: "seeker" | "provider" | null;
}) {
  const t = useTranslations("CategoryOnboarding");
  const tw = useTranslations("Wizard");
  // Only a real, already-submitted profile skips straight past the
  // picker -- an abandoned draft (claimed, nothing filled in) always
  // shows both options again, same as never having chosen at all.
  const [chosenRole, setChosenRole] = useState<"seeker" | "provider" | null>(
    initialRole === "provider" && providerProfile
      ? "provider"
      : initialRole === "seeker" && seekerProfile
        ? "seeker"
        : providerProfile && providerProfile.status !== "draft"
          ? "provider"
          : seekerProfile && seekerProfile.status !== "draft"
            ? "seeker"
            : null,
  );
  // Claiming (below) can hand back a brand-new draft row the server-side
  // props above don't know about yet -- these start from the props and
  // get filled in once a claim resolves.
  const [seeker, setSeeker] = useState(seekerProfile);
  const [provider, setProvider] = useState(providerProfile);
  const [claiming, setClaiming] = useState<"seeker" | "provider" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Commits to a role the moment it's picked, before any real profile
  // fields are filled in -- this is what lets the nav show this category right away instead of only after
  // the whole form is submitted. Re-picking a role that's already claimed
  // (or fully onboarded) just reuses that same row -- never overwrites it.
  async function chooseRole(role: "seeker" | "provider") {
    if (role === "seeker" && seeker) return setChosenRole("seeker");
    if (role === "provider" && provider) return setChosenRole("provider");

    setClaiming(role);
    setError(null);
    const res = await request("/api/generic-profile/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categorySlug, role }),
    });
    setClaiming(null);

    if (!res || !res.ok) {
      setError(tw("genericError"));
      return;
    }

    const { profile } = await res.json();
    // The claim response is a brand-new generic_profiles row, which has no
    // contact_phone column of its own (that's shared account state on
    // users) -- fall back to whatever this account already has saved via
    // another profile/category, not null, or a blank resubmission of this
    // form would wipe it out everywhere.
    const withContact = { ...profile, contact_phone: accountContactPhone } as NonNullable<ExistingProfile>;
    if (role === "seeker") setSeeker(withContact);
    else setProvider(withContact);
    setChosenRole(role);
  }

  // "I need a nurse" clicked by mistake, meaning "I am a nurse" -- or just
  // changing their mind before submitting anything. If nothing was ever
  // filled in (still a draft), delete it so they're back to never having
  // chosen at all; a real submitted profile is left untouched either way,
  // this just shows the picker again.
  async function changeRole(current: "seeker" | "provider") {
    const profile = current === "seeker" ? seeker : provider;
    if (profile && profile.status === "draft") {
      await request("/api/generic-profile/claim", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorySlug, role: current }),
      });
      if (current === "seeker") setSeeker(null);
      else setProvider(null);
    }
    setChosenRole(null);
  }

  useEffect(() => {
    // After the first render, as a callback, so the claim's state updates
    // aren't made from the effect body itself.
    if (startRole) void Promise.resolve().then(() => chooseRole(startRole));
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forms = FORMS[categorySlug];

  if (chosenRole === "provider" && forms) {
    const ProviderForm = forms.provider;
    return <ProviderForm categorySlug={categorySlug} initialProfile={provider} onBack={() => changeRole("provider")} />;
  }
  if (chosenRole === "seeker" && forms) {
    const SeekerForm = forms.seeker;
    return <SeekerForm categorySlug={categorySlug} initialProfile={seeker} onBack={() => changeRole("seeker")} />;
  }

  // Starting a side straight away: no flash of the choice it replaces.
  if (startRole && !error) {
    return <p className="p-8 text-center text-sm text-muted">{tw("loading")}</p>;
  }

  return (
    <>
      <div className="flex items-start justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-lg">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance">{t("roleTitle", { category: categoryName })}</h1>
          <p className="mt-2 text-muted">{t("roleSubtitle")}</p>
          {/* Same colors and icons as Home's "Need help" / "Offer your services" cards. */}
          <div className="mt-7 flex flex-col gap-3">
            {(["seeker", "provider"] as const).map((role) => {
              const seeker = role === "seeker";
              const Icon = seeker ? PersonIcon : ProviderIcon;
              const key = seeker ? "Seeker" : "Provider";
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => chooseRole(role)}
                  disabled={claiming !== null}
                  className={`group flex items-center gap-4 rounded-2xl border p-5 text-start transition active:scale-[0.98] disabled:opacity-60 ${
                    seeker
                      ? "border-primary/15 bg-primary-soft/50 hover:border-primary/40"
                      : "border-secondary/15 bg-secondary-soft/50 hover:border-secondary/40"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                      seeker ? "bg-primary-soft text-primary" : "bg-secondary-soft text-secondary"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Per-category key, e.g. "nursing.roleSeekerTitle" -- see the nested entries in CategoryOnboarding */}
                    <span className="block font-display font-bold text-ink">{t(`${categorySlug}.role${key}Title`)}</span>
                    <span className="mt-1 block text-sm text-muted">{t(`${categorySlug}.role${key}Description`)}</span>
                  </span>
                  <ChevronIcon
                    className={`h-5 w-5 shrink-0 transition group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 ${
                      seeker ? "text-primary" : "text-secondary"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger mt-4">{error}</p>}
        </div>
      </div>
    </>
  );
}
