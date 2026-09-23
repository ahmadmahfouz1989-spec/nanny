"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SavedProfileCard from "@/components/matches/saved-profile-card";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import { LogoLoader } from "@/components/animated-logo";
import { ui } from "@/lib/ui";
import type { SavedListItem } from "@/lib/saved-profiles";

const TONES = ["primary", "secondary", "berry"] as const;
const CATEGORIES = ["nanny", "nursing", "tutoring"] as const;

export default function SavedClient() {
  const t = useTranslations("SavedProfiles");
  const tNav = useTranslations("Nav");

  const [items, setItems] = useState<SavedListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<"" | (typeof CATEGORIES)[number]>("");
  const [role, setRole] = useState<"" | "seeking" | "offering">("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (role) params.set("role", role);

    fetch(`/api/saved-profiles?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((body) => {
        setItems(body.items ?? []);
        setNextCursor(body.nextCursor ?? null);
      })
      .catch(() => setError(t("loading")));
  }, [category, role, t]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (role) params.set("role", role);
    params.set("cursor", nextCursor);

    fetch(`/api/saved-profiles?${params}`)
      .then((res) => res.json())
      .then((body) => {
        setItems((prev) => [...(prev ?? []), ...(body.items ?? [])]);
        setNextCursor(body.nextCursor ?? null);
      })
      .finally(() => setLoadingMore(false));
  }

  function removeItem(item: SavedListItem) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
  }

  function restoreItem(item: SavedListItem) {
    setItems((prev) => [item, ...(prev ?? [])]);
  }

  const hasFilters = !!(category || role);
  const filteredEmptyLabel = category ? tNav(category) : role === "seeking" ? t("roleSeeking") : t("roleOffering");

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <h1 className="font-display text-2xl font-bold mb-1">{t("pageTitle")}</h1>
      <p className="text-sm text-muted mb-4">{t("sortRecentlySaved")}</p>

      <div className="flex flex-wrap items-center gap-2 mb-6 rounded-2xl border border-border bg-surface-sunken/50 p-3">
        <select className={ui.select + " w-auto"} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="">{t("filterAllCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tNav(c)}
            </option>
          ))}
        </select>
        <select className={ui.select + " w-auto"} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="">{t("filterAllRoles")}</option>
          <option value="seeking">{t("roleSeeking")}</option>
          <option value="offering">{t("roleOffering")}</option>
        </select>
      </div>

      {!items && !error && <LogoLoader label={t("loading")} fullHeight />}
      {error && <p className="text-sm text-muted">{error}</p>}

      {items && items.length === 0 && !hasFilters && (
        <div className={ui.card + " overflow-hidden text-center"}>
          <CreateProfileIllustration className="w-full h-32" />
          <div className="p-6">
            <p className="font-display font-semibold mb-1">{t("emptyTitle")}</p>
            <p className="text-sm text-muted mb-4">{t("emptyBody")}</p>
            <Link href="/categories" className={ui.link + " text-sm"}>
              {t("emptyBrowseLink")}
            </Link>
          </div>
        </div>
      )}

      {items && items.length === 0 && hasFilters && (
        <div className={ui.card + " overflow-hidden"}>
          <p className="text-sm text-muted p-6">{t("emptyFiltered", { category: filteredEmptyLabel })}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {items?.map((item, i) => (
          <SavedProfileCard key={item.id} item={item} tone={TONES[i % TONES.length]} onRemoved={removeItem} onRestored={restoreItem} />
        ))}
      </div>

      {nextCursor && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className={ui.buttonGhost + " mt-6 w-full"}>
          {loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
