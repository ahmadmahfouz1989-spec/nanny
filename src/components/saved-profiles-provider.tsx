"use client";

import { createContext, useCallback, useContext, useState } from "react";

type SavedMap = Map<string, boolean>;

type SavedProfilesContextValue = {
  isSaved: (type: string, profileId: string, fallback: boolean) => boolean;
  setSaved: (type: string, profileId: string, saved: boolean) => void;
};

const SavedProfilesContext = createContext<SavedProfilesContextValue | null>(null);

function keyOf(type: string, profileId: string) {
  return `${type}:${profileId}`;
}

/**
 * Shared saved/unsaved state so the same profile shows consistently across
 * every simultaneously-mounted surface (a discovery card and an opened
 * profile preview for the same profile) without an extra request per
 * surface. Each surface still seeds itself from its own API response
 * (`isSaved` on the search/profile routes) via the `fallback` param --
 * this map only overrides that once a mutation happens during the current
 * session, it isn't the source of truth on first load.
 */
export function SavedProfilesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<SavedMap>(new Map());

  const isSaved = useCallback(
    (type: string, profileId: string, fallback: boolean) => overrides.get(keyOf(type, profileId)) ?? fallback,
    [overrides],
  );

  const setSaved = useCallback((type: string, profileId: string, saved: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(keyOf(type, profileId), saved);
      return next;
    });
  }, []);

  return <SavedProfilesContext.Provider value={{ isSaved, setSaved }}>{children}</SavedProfilesContext.Provider>;
}

export function useSavedProfiles() {
  const ctx = useContext(SavedProfilesContext);
  if (!ctx) throw new Error("useSavedProfiles must be used within a SavedProfilesProvider");
  return ctx;
}
