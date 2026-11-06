"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";

export type DashboardRole = "seeker" | "provider";

// Asking for a repair or a delivery starts with the job itself, not a form about you.
function addRoleHref(slug: string, role: DashboardRole) {
  if (role === "seeker" && slug === "maintenance") return "/quotes/new";
  if (role === "seeker" && slug === "errands") return "/orders/new";
  return `/categories/${slug}/onboarding?role=${role}`;
}

/**
 * Which side of this service you're looking at, always in the same place and
 * order. A side you don't have yet is a way to add it here, without
 * touching the one you have.
 */
export default function RoleBar({
  slug,
  active,
  roles,
  onSwitch,
}: {
  slug: string;
  active: DashboardRole;
  roles: DashboardRole[];
  onSwitch?: (role: DashboardRole) => void;
}) {
  const t = useTranslations("Dashboard");
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-sunken p-1">
      {(["provider", "seeker"] as const).map((role) => {
        const label = role === "provider" ? t("roleProvider") : t("roleSeeker");
        if (!roles.includes(role)) {
          return (
            <Link key={role} href={addRoleHref(slug, role)} className={ui.toggleTab(false) + " text-center"}>
              + {label}
            </Link>
          );
        }
        return (
          <button key={role} type="button" aria-pressed={role === active} onClick={() => onSwitch?.(role)} className={ui.toggleTab(role === active)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
