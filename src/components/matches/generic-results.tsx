"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import { CardListSkeleton } from "@/components/skeletons";
import { useLiveMatches } from "@/components/matches/use-live-matches";
import MatchCard, { type Match } from "./match-card";
import MatchFilters from "./match-filters";
import { ui } from "@/lib/ui";

const PAGE_SIZE = 20;

const TONES = ["primary", "secondary", "berry"] as const;

export default function GenericResults({
  categorySlug,
  role,
  targetMatchId = null,
}: {
  categorySlug: string;
  // From a match notification (?match=...) -- see useLiveMatches.
  targetMatchId?: string | null;
  // Only needed when the account holds both a seeker and a provider
  // profile in this category -- otherwise the API resolves the single
  // profile on its own.
  role?: "seeker" | "provider";
}) {
  const t = useTranslations("Matches");
  const [myRole, setMyRole] = useState<"seeker" | "provider" | null>(null);
  const [results, setResults] = useState<Match[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  useLiveMatches({
    results,
    setResults,
    targetMatchId,
    fetchTarget: (matchId) => {
      const params = new URLSearchParams({ categorySlug, matchId });
      if (role) params.set("role", role);
      return fetch(`/api/generic-matches?${params}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => body?.results?.[0] ?? null)
        .catch(() => null);
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [governorateId, setGovernorateId] = useState("");
  const [day, setDay] = useState("");
  const [minYearsExperience, setMinYearsExperience] = useState("");
  // What's typed, and what's actually searched: the list only refetches
  // once typing pauses, not on every keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function listParams() {
    const params = new URLSearchParams({ categorySlug, pageSize: String(PAGE_SIZE) });
    if (role) params.set("role", role);
    if (governorateId) params.set("governorateId", governorateId);
    if (day) params.set("day", day);
    if (minYearsExperience) params.set("minYearsExperience", minYearsExperience);
    if (search) params.set("q", search);
    return params;
  }

  useEffect(() => {
    fetch(`/api/generic-matches?${listParams()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(t("errorNoProfile"));
          return;
        }
        setMyRole(body.myRole);
        setResults(body.results);
        setTotal(body.total);
      })
      .catch(() => setError(t("loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, role, t, governorateId, day, minYearsExperience, search]);

  // A ref as well as state: the scroll observer can fire again before a
  // re-render, and must never start a second request for the same page.
  const loadingMoreRef = useRef(false);
  function loadMore() {
    if (!results || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const params = listParams();
    params.set("page", String(Math.floor(results.length / PAGE_SIZE) + 1));
    fetch(`/api/generic-matches?${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return;
        // A notification's target may already be pinned at the top (see
        // useLiveMatches) -- don't list it twice when its page arrives.
        setResults((prev) => {
          const known = new Set((prev ?? []).map((r) => r.id));
          return [...(prev ?? []), ...(body.results as Match[]).filter((r) => !known.has(r.id))];
        });
        setTotal(body.total);
      })
      // A failed page leaves the list as it is; scrolling tries again.
      .catch(() => {})
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }

  // Infinite scroll: load the next page when the end of the list comes
  // within about a screen of view. The button below stays as a fallback.
  const canLoadMore = !!results && results.length > 0 && results.length < total;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      // The app shell's <main> is what scrolls, not the window.
      { root: sentinel.closest("main"), rootMargin: "0px 0px 800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, results?.length]);

  // Minimum experience only makes sense filtering providers (a seeker has
  // no years-of-experience field), so only show it once we know the
  // viewer is a seeker looking at providers.
  const showExperienceFilter = myRole === "seeker";
  const hasFilters = !!(search || governorateId || day || (showExperienceFilter && minYearsExperience));
  function clearFilters() {
    setGovernorateId("");
    setDay("");
    setMinYearsExperience("");
    setSearchInput("");
    setSearch("");
  }

  return (
    <div className={`max-w-2xl w-full mx-auto px-6 py-8 ${!results && !error ? "min-h-screen flex flex-col" : ""}`}>
      <h1 className="font-display text-2xl font-bold mb-1">{t("titleMatches")}</h1>
      <p className="text-sm text-muted mb-4">{t("resultsSubtitle")}</p>

      <MatchFilters
        search={searchInput}
        onSearch={setSearchInput}
        governorateId={governorateId}
        onGovernorate={setGovernorateId}
        day={day}
        onDay={setDay}
        minYears={minYearsExperience}
        onMinYears={setMinYearsExperience}
        showMinYears={showExperienceFilter}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      {!results && !error && <CardListSkeleton label={t("loading")} />}
      {error && <p className="text-sm text-muted">{error}</p>}
      {results && results.length === 0 && (
        <div className={ui.card + " overflow-hidden"}>
          <CreateProfileIllustration className="w-full h-32" />
          <p className="text-sm text-muted p-6">{hasFilters ? t("emptyFiltered") : t("empty")}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {results?.map((r, i, arr) => {
          const hasFeaturedSection = arr.some((x) => x.featured);
          const showFeaturedHeader = r.featured && i === 0;
          const showRegularHeader = !r.featured && hasFeaturedSection && (i === 0 || arr[i - 1].featured);
          return (
            <div key={r.id} className="flex flex-col gap-2">
              {showFeaturedHeader && (
                <p className={ui.eyebrow + " flex items-center gap-1.5"}>
                  <span className="text-accent-hover">★</span>
                  {t("featuredSection")}
                </p>
              )}
              {showRegularHeader && <p className={ui.eyebrow}>{t("allMatchesSection")}</p>}
              <MatchCard match={r} viewerSide={myRole} tone={TONES[i % TONES.length]} />
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} aria-hidden />
      {canLoadMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className={ui.buttonGhost + " mt-6 w-full"}>
          {loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
