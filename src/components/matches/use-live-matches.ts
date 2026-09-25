"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MATCH_TARGET_EVENT, type MatchTargetDetail } from "@/lib/match-target";
import type { MatchStatusRow } from "@/lib/match-statuses";

const POLL_MS = 30_000;

type LiveMatch = { id: string; status: string; interest_expires_at: string | null };

/**
 * Keeps the match cards a results list is showing in sync with changes
 * the *other* person makes (accepting or declining interest), which the
 * list's own one-off fetch never sees. Refreshes just the statuses of the
 * cards already on screen -- every 30s while the tab is visible, when the
 * tab regains focus, and whenever a match notification targets this list
 * -- rather than refetching and re-paginating everything.
 *
 * Also owns landing on a notification's target card: scrolls to and
 * briefly highlights `match-<targetMatchId>` once it has rendered, and
 * again whenever the bell re-announces that same target. A target the
 * list doesn't contain (hidden by the current filters, or on a later
 * page) is fetched on its own via `fetchTarget` and pinned to the top.
 */
export function useLiveMatches<T extends LiveMatch>({
  results,
  setResults,
  targetMatchId,
  fetchTarget,
}: {
  results: T[] | null;
  setResults: (update: (prev: T[] | null) => T[] | null) => void;
  targetMatchId: string | null;
  fetchTarget: (matchId: string) => Promise<T | null>;
}) {
  const fetchTargetRef = useRef(fetchTarget);
  useEffect(() => {
    fetchTargetRef.current = fetchTarget;
  }, [fetchTarget]);

  const idsRef = useRef<string[]>([]);
  useEffect(() => {
    idsRef.current = (results ?? []).map((r) => r.id);
  }, [results]);

  const refresh = useCallback(async () => {
    const ids = idsRef.current;
    if (ids.length === 0) return;
    const res = await fetch(`/api/generic-matches/statuses?ids=${ids.join(",")}`).catch(() => null);
    if (!res?.ok) return;
    const { statuses } = (await res.json()) as { statuses: MatchStatusRow[] };
    const byId = new Map(statuses.map((s) => [s.id, s]));
    setResults((prev) => {
      if (!prev) return prev;
      let changed = false;
      const next = prev.map((r) => {
        const s = byId.get(r.id);
        if (!s || (s.status === r.status && s.interest_expires_at === r.interest_expires_at)) return r;
        changed = true;
        return { ...r, status: s.status, interest_expires_at: s.interest_expires_at };
      });
      return changed ? next : prev;
    });
  }, [setResults]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  // Bumped when the bell re-announces the target already in the URL.
  const [targetToken, setTargetToken] = useState(0);
  useEffect(() => {
    function onTarget(e: Event) {
      if ((e as CustomEvent<MatchTargetDetail>).detail.matchId === targetMatchId) setTargetToken((n) => n + 1);
    }
    window.addEventListener(MATCH_TARGET_EVENT, onTarget);
    return () => window.removeEventListener(MATCH_TARGET_EVENT, onTarget);
  }, [targetMatchId]);

  const pendingScrollRef = useRef<string | null>(null);
  const loaded = results !== null;
  useEffect(() => {
    // Wait for the list's own first load, so the pinned target isn't
    // overwritten by it (or fetched needlessly when it's already there).
    if (!targetMatchId || !loaded) return;
    pendingScrollRef.current = targetMatchId;
    if (idsRef.current.includes(targetMatchId)) {
      // A notification is exactly when this card's status just changed.
      refresh();
      return;
    }
    let active = true;
    fetchTargetRef.current(targetMatchId).then((target) => {
      if (!active || !target) return;
      setResults((prev) => [target, ...(prev ?? []).filter((r) => r.id !== target.id)]);
    });
    return () => {
      active = false;
    };
  }, [targetMatchId, targetToken, loaded, refresh, setResults]);

  useEffect(() => {
    const id = pendingScrollRef.current;
    const el = id ? document.getElementById(`match-${id}`) : null;
    if (!el) return;
    pendingScrollRef.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
  }, [results, targetToken]);
}
