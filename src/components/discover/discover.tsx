import { cookies } from "next/headers";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { categoryName, getCategories } from "@/lib/categories";
import { normalizeServiceText } from "@/lib/service-text";
import { createClient } from "@/lib/supabase/server";
import { nearbyProviders } from "@/lib/search";
import { canSeePoints } from "@/lib/points";
import { REGION_COOKIE } from "@/lib/region";
import VerifiedCheck from "@/components/verified-check";
import RatePrompt from "@/components/rating/rate-prompt";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import {
  ChevronIcon,
  FreeIcon,
  LockIcon,
  ProviderIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "@/components/home-icons";
import { ui } from "@/lib/ui";
import { profileStrength, type ProfileStrength } from "@/lib/profile-growth";
import ServiceSearch, { type SearchableService } from "./service-search";
import CategoryTiles, { LOOK } from "@/components/category-tiles";

function labels(namespace: string | undefined): string {
  if (!namespace) return "";
  return [en, ar]
    .flatMap((messages) => Object.values((messages as unknown as Record<string, Record<string, unknown>>)[namespace] ?? {}))
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

type ProviderRow = { id: string; profile_photo_url: string | null; headline: string | null; attributes: unknown; moderation_status: string; category_id: string };

/**
 * The least complete of someone's live provider profiles, for the reminder
 * on Home -- what to add next, until every one is complete.
 */
async function weakestProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profiles: ProviderRow[],
): Promise<{ profileId: string; categoryId: string; strength: ProfileStrength } | null> {
  const live = profiles.filter((p) => p.moderation_status === "approved");
  if (live.length === 0) return null;
  const { data: work } = await supabase.from("work_projects").select("profile_id, work_photos(id)").in("profile_id", live.map((p) => p.id));
  const withWork = new Set((work ?? []).filter((w) => (w.work_photos ?? []).length > 0).map((w) => w.profile_id));
  const scored = live.map((p) => ({
    profileId: p.id,
    categoryId: p.category_id,
    strength: profileStrength({
      role: "provider",
      photoUrl: p.profile_photo_url,
      headline: p.headline,
      attributes: (p.attributes ?? {}) as Record<string, unknown>,
      hasWork: withWork.has(p.id),
    }),
  }));
  return scored.sort((a, b) => a.strength.percent - b.strength.percent)[0]!;
}

/**
 * The top of Home: search, real people near you, the services, why
 * ouiKnow is safe to use, and a way in for each side. The latest posts
 * follow.
 */
export default async function Discover() {
  const t = await getTranslations("Discover");
  const tProfile = await getTranslations("ProfilePage");
  const tPoints = await getTranslations("Points");
  const locale = await getLocale();
  const live = (await getCategories()).filter((c) => c.status === "live" && c.href);
  // Someone already offering a service is past "create your profile":
  // that card leads to their matches instead.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: mine } = user
    ? await supabase
        .from("generic_profiles")
        .select("id, profile_photo_url, headline, attributes, moderation_status, category_id")
        .eq("user_id", user.id)
        .eq("role", "provider")
        .neq("status", "draft")
    : { data: null };
  const offering = mine?.length ?? 0;
  const [strength, showPoints] = await Promise.all([weakestProfile(supabase, mine ?? []), canSeePoints(user?.id ?? null)]);
  // Their own ledger rows (RLS): the balance for the invite card.
  const { data: ledger } = showPoints && user ? await supabase.from("points_ledger").select("points").eq("user_id", user.id) : { data: null };
  const balance = (ledger ?? []).reduce((sum, r) => sum + r.points, 0);

  const region = (await cookies()).get(REGION_COOKIE)?.value || null;
  const [nearby, { data: place }] = await Promise.all([
    nearbyProviders(region, user?.id ?? null, locale),
    region ? supabase.from("locations").select("name_en, name_ar").eq("id", region).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const regionName = place ? (locale === "ar" ? place.name_ar : place.name_en) : null;

  const searchable: SearchableService[] = live.map((c) => ({
    slug: c.slug,
    name: categoryName(c, locale),
    href: c.href!,
    words: normalizeServiceText([c.name_en, c.name_ar, c.tagline_en, c.tagline_ar, labels(LOOK[c.slug]?.words)].join(" ")),
  }));

  const trust = [
    { Icon: ShieldCheckIcon, text: t("trustVerified") },
    { Icon: FreeIcon, text: t("trustFree") },
    { Icon: LockIcon, text: t("trustPrivate") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ServiceSearch services={searchable} />

      {user && <RatePrompt />}

      {nearby.people.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold">{t("nearTitle")}</h2>
              <p className="truncate text-xs text-muted">{nearby.wide || !regionName ? t("nearAll") : t("nearIn", { place: regionName })}</p>
            </div>
          </div>
          {/* Sideways, edge to edge on the phone: the row runs off the screen to say "there's more". */}
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {nearby.people.map((p) => (
              <li key={p.id} className="w-32 shrink-0 snap-start">
                <Link href={`/u/${p.id}`} className="group flex flex-col gap-1.5">
                  <span className="relative block aspect-square overflow-hidden rounded-2xl border border-border bg-surface-sunken">
                    <Image src={p.photoUrl} alt="" fill sizes="128px" className="object-cover transition group-active:scale-[0.98]" />
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-ink">
                    <span className="truncate">{p.fullName}</span>
                    {p.verified && <VerifiedCheck label={t("verified")} />}
                  </span>
                  <span className="-mt-1 truncate text-xs text-muted">
                    {p.categoryName}
                    {p.place && ` · ${p.place}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{t("browse")}</h2>
          <Link href="/categories" className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary">
            {t("viewAll")}
            <ChevronIcon className="h-4 w-4" />
          </Link>
        </div>
        <CategoryTiles categories={live} locale={locale} />
      </section>

      {/* One quiet line of reassurance, not a block to read. */}
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-medium text-ink/80">
        {trust.map(({ Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5">
            <Icon className="h-4 w-4 shrink-0 text-secondary" />
            {text}
          </li>
        ))}
      </ul>

      {strength && strength.strength.percent < 100 && (
        <Link href={`/u/${strength.profileId}`} className={ui.card + " flex flex-col gap-2 p-4 transition hover:border-border-strong"}>
          <span className="flex items-center justify-between gap-3">
            <span className="font-display text-sm font-bold text-ink">
              {t("strengthTitle", { service: categoryName(live.find((c) => c.id === strength.categoryId) ?? live[0]!, locale), percent: strength.strength.percent })}
            </span>
            <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${strength.strength.percent}%` }} />
          </span>
          <span className="text-xs text-muted">{t("strengthNext", { tip: tProfile(`strengthAdd_${strength.strength.missing[0]!}`) })}</span>
        </Link>
      )}

      {showPoints && (
        <Link href="/profile#points" className="flex items-center gap-3 rounded-2xl bg-primary-soft/70 px-4 py-3 transition-colors hover:bg-primary-soft">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-bold text-ink">{tPoints("homeTitle")}</span>
            <span className="block text-xs text-muted">{tPoints("homeBody", { points: balance })}</span>
          </span>
        </Link>
      )}

      {/* Finding help is the category grid above; this is the way in for
          people offering a service. */}
      <Link
        href={offering ? "/dashboard" : "/categories"}
        className="flex items-center gap-3 rounded-2xl bg-secondary-soft/60 px-4 py-3 transition-colors hover:bg-secondary-soft"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
          <ProviderIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-ink">{offering ? t("providerTitleHave") : t("providerTitle")}</span>
          <span className="block text-xs text-muted">{offering ? t("providerBodyHave") : t("providerBody")}</span>
        </span>
        <span className="sr-only">{offering ? t("providerCtaHave") : t("providerCta")}</span>
        <ChevronIcon className="h-5 w-5 shrink-0 text-secondary" />
      </Link>
    </div>
  );
}
