"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronIcon, SearchIcon } from "@/components/home-icons";
import { normalizeServiceText as normalize } from "@/lib/service-text";

export type SearchableService = { slug: string; name: string; href: string; words: string };

/**
 * The search box on Home. Submitting opens /search -- people and posts
 * matching the words, in the area picked at the top. While typing, the
 * services the words point to ("plumber" -> Home maintenance, in English
 * or Arabic) show underneath as shortcuts.
 */
export default function ServiceSearch({ services }: { services: SearchableService[] }) {
  const t = useTranslations("Discover");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = normalize(query.trim());
  const results = q ? services.filter((s) => q.split(/\s+/).every((word) => s.words.includes(word))) : [];

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q) router.push(`/search?${new URLSearchParams({ q: query.trim() })}`);
        }}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm focus-within:border-primary/50"
      >
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {q && (
        <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
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
