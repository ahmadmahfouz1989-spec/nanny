"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronIcon, SearchIcon } from "@/components/home-icons";
import { normalizeServiceText as normalize } from "@/lib/service-text";
import { Avatar } from "@/app/[locale]/feed/feed-shared";
import VerifiedCheck from "@/components/verified-check";
import type { NameSuggestion } from "@/lib/search";

export type SearchableService = { slug: string; name: string; href: string; words: string };

/**
 * The search box on Home. Submitting opens /search -- people and posts
 * matching the words, in the area picked at the top. While typing, the
 * services the words point to ("plumber" -> Home maintenance, in English
 * or Arabic) show underneath as shortcuts, and so do people whose name
 * matches -- tapping one opens their profile.
 */
export default function ServiceSearch({ services }: { services: SearchableService[] }) {
  const t = useTranslations("Discover");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = normalize(query.trim());
  const results = q ? services.filter((s) => q.split(/\s+/).every((word) => s.words.includes(word))) : [];
  const locale = useLocale();
  const typed = query.trim();
  const [people, setPeople] = useState<{ for: string; list: NameSuggestion[] }>({ for: "", list: [] });

  useEffect(() => {
    if (typed.length < 2) return;
    const controller = new AbortController();
    // Wait for a pause in typing before asking.
    const timer = setTimeout(() => {
      fetch(`/api/search/names?${new URLSearchParams({ q: typed, locale })}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((body: { people?: NameSuggestion[] }) => setPeople({ for: typed, list: body.people ?? [] }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed, locale]);
  // Only names for what's in the box now: never a list left from earlier words.
  const shownPeople = typed.length >= 2 && people.for === typed ? people.list : [];

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q) router.push(`/search?${new URLSearchParams({ q: query.trim() })}`);
        }}
        className="flex items-center gap-3 rounded-2xl border border-border-strong bg-surface px-4 py-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15"
      >
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted/65 outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {q && (
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {shownPeople.map((p) => (
            <Link key={p.id} href={`/u/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken">
              <Avatar photoUrl={p.photoUrl} name={p.fullName} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="inline-flex min-w-0 items-center gap-1 text-[15px] font-medium text-ink">
                  <span className="truncate">{p.fullName}</span>
                  {p.verified && <VerifiedCheck label={t("verified")} />}
                </span>
                <span className="truncate text-xs text-muted">{p.categoryName}</span>
              </span>
              <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          ))}
          <Link
            href={`/search?${new URLSearchParams({ q: query.trim() })}`}
            className="flex items-center gap-3 px-4 py-3 text-[15px] font-medium text-primary hover:bg-surface-sunken"
          >
            <SearchIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t("searchPeople", { query: query.trim() })}</span>
            <ChevronIcon className="h-4 w-4" />
          </Link>
          {results.map((s) => (
            <Link key={s.slug} href={s.href} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px] text-ink hover:bg-surface-sunken">
              <span>
                <span className="text-muted">{t("serviceLabel")} </span>
                <span className="font-medium">{s.name}</span>
              </span>
              <ChevronIcon className="h-4 w-4 text-muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
