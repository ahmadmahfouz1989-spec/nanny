"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SavedProfileCard from "@/components/matches/saved-profile-card";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import { LogoLoader } from "@/components/animated-logo";
import { ui } from "@/lib/ui";
import type { SavedListItem } from "@/lib/saved-profiles";
import { useSavedProfiles } from "@/components/saved-profiles-provider";

const TONES = ["primary", "secondary", "berry"] as const;
const CATEGORIES = ["nanny", "nursing", "tutoring"] as const;

export default function SavedClient() {
  const t = useTranslations("SavedProfiles");
  const tNav = useTranslations("Nav");
  const { isSaved } = useSavedProfiles();

  const [items, setItems] = useState<SavedListItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<"" | (typeof CATEGORIES)[number]>("");
  const [role, setRole] = useState<"" | "seeking" | "offering">("");
  // Bumped on every filter change and captured by each fetch at the moment
  // it's sent -- a response only gets applied if this still matches when it
  // arrives. Without it, an older filter's slower response (or a load-more
  // request in flight when filters change) can land after a newer one and
  // overwrite it with the wrong category's results.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (role) params.set("role", role);

    fetch(`/api/saved-profiles?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((body) => {
        if (requestIdRef.current !== requestId) return;
        setItems(body.items ?? []);
        setNextCursor(body.nextCursor ?? null);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setError(t("loading"));
      });
  }, [category, role, t]);

  // Drop the previous filter's page and cursor in the same update as the
  // filter change -- otherwise its Load more stays clickable while the new
  // first page loads, and would fetch the new filter with the old filter's
  // cursor.
  function resetResults() {
    setItems(null);
    setNextCursor(null);
    setError(null);
  }

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const requestId = requestIdRef.current;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (role) params.set("role", role);
    params.set("cursor", nextCursor);

    fetch(`/api/saved-profiles?${params}`)
      .then((res) => res.json())
      .then((body) => {
        if (requestIdRef.current !== requestId) return;
        setItems((prev) => [...(prev ?? []), ...(body.items ?? [])]);
        setNextCursor(body.nextCursor ?? null);
      })
      .finally(() => setLoadingMore(false));
  }

  function removeItem(item: SavedListItem) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
  }

  // Keyed by target, not favorites row id: Undo first restores the old
  // row's snapshot, then replaces it with the re-created row's identity.
  function restoreItem(item: SavedListItem) {
    setItems((prev) => [
      item,
      ...(prev ?? []).filter((i) => i.targetProfileId !== item.targetProfileId),
    ]);
  }

  // A profile unsaved from somewhere other than this card's own Remove
  // (the bookmark inside its expanded preview) only updates the shared
  // saved-state map -- hide it here too rather than leaving a card for
  // something that is no longer saved.
  const visibleItems = items?.filter((item) => isSaved(item.targetProfileId, true)) ?? null;

  const hasFilters = !!(category || role);
  const filteredEmptyLabel = category ? tNav(category) : role === "seeking" ? t("roleSeeking") : t("roleOffering");

  return (
    <div className="max-w-2xl w-full mx-auto px-6 py-8">
      <h1 className="font-display text-2xl font-bold mb-1">{t("pageTitle")}</h1>
      <p className="text-sm text-muted mb-4">{t("sortRecentlySaved")}</p>

      <div className="flex flex-wrap items-center gap-2 mb-6 rounded-2xl border border-border bg-surface-sunken/50 p-3">
        <select
          className={ui.select + " w-auto"}
          value={category}
          onChange={(e) => {
            resetResults();
            setCategory(e.target.value as typeof category);
          }}
        >
          <option value="">{t("filterAllCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tNav(c)}
            </option>
          ))}
        </select>
        <select
          className={ui.select + " w-auto"}
          value={role}
          onChange={(e) => {
            resetResults();
            setRole(e.target.value as typeof role);
          }}
        >
          <option value="">{t("filterAllRoles")}</option>
          <option value="seeking">{t("roleSeeking")}</option>
          <option value="offering">{t("roleOffering")}</option>
        </select>
      </div>

      {!items && !error && <LogoLoader label={t("loading")} fullHeight />}
      {error && <p className="text-sm text-muted">{error}</p>}

      {visibleItems && visibleItems.length === 0 && !hasFilters && (
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

      {visibleItems && visibleItems.length === 0 && hasFilters && (
        <div className={ui.card + " overflow-hidden"}>
          <p className="text-sm text-muted p-6">{t("emptyFiltered", { category: filteredEmptyLabel })}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {visibleItems?.map((item, i) => (
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
