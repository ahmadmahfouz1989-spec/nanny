"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChevronIcon, SearchIcon } from "@/components/home-icons";
import { normalizeServiceText as normalize } from "@/lib/service-text";

export type SearchableService = { slug: string; name: string; href: string; words: string };

/**
 * "Search for a service" on Home: matches what you type against every
 * service's name and description, in English and Arabic ("plumber" finds
 * Home maintenance), and opens it.
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
          if (results[0]) router.push(results[0].href);
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
        <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">{t("noResults", { query: query.trim() })}</p>
          ) : (
            results.map((s) => (
              <Link key={s.slug} href={s.href} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px] font-medium text-ink hover:bg-surface-sunken">
                {s.name}
                <ChevronIcon className="h-4 w-4 text-muted" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
