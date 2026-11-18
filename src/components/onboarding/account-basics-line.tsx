"use client";

import { useEffect, useRef, useState } from "react";
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
export default function AccountBasicsLine({ onLoad }: { onLoad?: (basics: AccountBasics) => void } = {}) {
  const t = useTranslations("AboutYou");
  const tn = useTranslations("Nationality");
  const path = usePathname();
  const query = useSearchParams().toString();
  const [basics, setBasics] = useState<AccountBasics | null>(null);
  // Loaded once; a parent's new callback each render doesn't fetch again.
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });
  useEffect(() => {
    fetch("/api/account/basics")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b?.basics) return;
        setBasics(b.basics);
        onLoadRef.current?.(b.basics);
      })
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
