import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { Avatar } from "../feed/feed-shared";
import { ChevronIcon, PinIcon, SearchIcon } from "@/components/home-icons";
import { REGION_COOKIE } from "@/lib/region";
import { SEARCH_LIMIT, search, type PersonResult, type PostResult } from "@/lib/search";
import { ui } from "@/lib/ui";

/**
 * Results for Home's search box: people offering, people looking, and
 * posts, in the area picked at the top of Home unless the person widens
 * it to all of Lebanon.
 */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; all?: string }>;
}) {
  const { locale } = await params;
  const { q = "", all } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations("Search");
  const query = q.trim().slice(0, 100);
  const cookieRegion = (await cookies()).get(REGION_COOKIE)?.value || null;
  const region = all ? null : cookieRegion;
  const { data: place } = region
    ? await supabase.from("locations").select("name_en, name_ar").eq("id", region).maybeSingle()
    : { data: null };
  const regionName = place ? (locale === "ar" ? place.name_ar : place.name_en) : null;

  const results = query ? await search(query, region, user.id, locale) : null;
  const total = results ? results.offering.length + results.seeking.length + results.posts.length : 0;
  const widen = `/search?${new URLSearchParams({ q: query, all: "1" })}`;
  const narrow = `/search?${new URLSearchParams({ q: query })}`;

  return (
    <AppShell active="feed">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-8">
        <form role="search" action={`/${locale}/search`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm focus-within:border-primary/50">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            enterKeyHint="search"
            autoFocus={!query}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {all && <input type="hidden" name="all" value="1" />}
        </form>

        {query && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <PinIcon className="h-4 w-4" />
            {regionName ? t("inRegion", { region: regionName }) : t("allLebanon")}
            {regionName && (
              <Link href={widen} className={ui.link}>
                {t("searchAll")}
              </Link>
            )}
            {all && cookieRegion && (
              <Link href={narrow} className={ui.link}>
                {t("backToRegion")}
              </Link>
            )}
          </p>
        )}

        {!query && <p className="text-sm text-muted">{t("hint")}</p>}

        {results && total === 0 && (
          <div className={ui.card + " flex flex-col items-start gap-3 p-5"}>
            <p className="font-display font-semibold">{t("noResults", { query })}</p>
            <p className="text-sm text-muted">{regionName ? t("noResultsRegion") : t("noResultsBody")}</p>
            <div className="flex flex-wrap gap-2">
              {regionName && (
                <Link href={widen} className={ui.buttonPrimary}>
                  {t("searchAll")}
                </Link>
              )}
              <Link href="/feed?compose=1" className={regionName ? ui.buttonSecondary : ui.buttonPrimary}>
                {t("postRequest")}
              </Link>
              <Link href="/categories" className={ui.buttonSecondary}>
                {t("browse")}
              </Link>
            </div>
          </div>
        )}

        {results && results.offering.length > 0 && (
          <Section title={t("offering")} count={results.offering.length}>
            {results.offering.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </Section>
        )}
        {results && results.seeking.length > 0 && (
          <Section title={t("seeking")} count={results.seeking.length}>
            {results.seeking.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </Section>
        )}
        {results && results.posts.length > 0 && (
          <Section title={t("posts")} count={results.posts.length}>
            {results.posts.map((p) => (
              <PostRow key={p.id} post={p} lookingFor={t("postLookingFor")} offering={t("postOffering")} />
            ))}
          </Section>
        )}
      </div>
    </AppShell>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-lg font-bold">
        {title} <span className="text-sm font-medium text-muted">{count >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : count}</span>
      </h2>
      <div className={ui.card + " divide-y divide-border overflow-hidden"}>{children}</div>
    </section>
  );
}

function PersonRow({ person }: { person: PersonResult }) {
  return (
    <Link href={`/u/${person.id}`} className="flex items-start gap-3 p-4 transition hover:bg-surface-sunken">
      <Avatar photoUrl={person.photoUrl} size={48} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-ink">{person.fullName}</span>
        <span className="text-xs text-muted">
          {person.categoryName}
          {person.place && ` · ${person.place}`}
        </span>
        {person.about && (
          <span dir="auto" className="mt-1 line-clamp-2 text-sm text-ink/80">
            {person.about}
          </span>
        )}
      </span>
      <ChevronIcon className="mt-3 h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

function PostRow({ post, lookingFor, offering }: { post: PostResult; lookingFor: string; offering: string }) {
  return (
    <Link href={`/feed?post=${post.id}`} className="flex items-start gap-3 p-4 transition hover:bg-surface-sunken">
      <Avatar photoUrl={post.authorPhotoUrl} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-semibold text-ink">{post.authorName}</span>
          <span className={ui.badge(post.kind === "looking_for" ? "secondary" : "accent") + " py-0!"}>
            {post.kind === "looking_for" ? lookingFor : offering}
          </span>
        </span>
        <span dir="auto" className="line-clamp-3 text-sm text-ink/80">
          {post.caption}
        </span>
      </span>
    </Link>
  );
}
