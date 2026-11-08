"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { ui } from "@/lib/ui";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import type { AccountBasics } from "@/lib/account-basics";

/**
 * At the top of every service form: who the profile is for, from "About
 * you" (name, phone, nationality, photo), with a way to change it. The form
 * doesn't ask these again; it saves them from the account.
 */
export default function AccountBasicsLine() {
  const t = useTranslations("AboutYou");
  const tn = useTranslations("Nationality");
  const path = usePathname();
  const query = useSearchParams().toString();
  const [basics, setBasics] = useState<AccountBasics | null>(null);
  useEffect(() => {
    fetch("/api/account/basics")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.basics && setBasics(b.basics))
      .catch(() => {});
  }, []);
  const here = query ? `${path}?${query}` : path;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken px-3 py-2.5">
      {basics?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={basics.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <AvatarIllustration name={basics?.fullName} className="h-11 w-11 shrink-0 rounded-full" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{basics?.fullName ?? "…"}</p>
        <p className="truncate text-xs text-muted" dir="auto">
          {[basics?.contactPhone, basics?.nationality ? (tn.has(basics.nationality) ? tn(basics.nationality) : basics.nationality) : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Link href={`/welcome/about-you?next=${encodeURIComponent(here)}`} className={ui.link + " shrink-0 text-sm"}>
        {t("edit")}
      </Link>
    </div>
  );
}
