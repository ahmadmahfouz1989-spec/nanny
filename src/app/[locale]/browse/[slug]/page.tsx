import { cookies } from "next/headers";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppShell from "@/components/app-shell";
import ServiceSwitcher from "@/components/service-switcher";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import RatingStars from "@/components/matches/rating-stars";
import { isCategorySlug } from "@/lib/category-slugs";
import { REGION_COOKIE } from "@/lib/region";
import { browseProviders } from "@/lib/public-browse";
import { TRADES } from "@/lib/validation/maintenance";
import { ERRAND_SERVICES } from "@/lib/validation/errands";
import { ui } from "@/lib/ui";
import BrowseFilters, { type RegionGroup } from "./browse-filters";
import VerifiedCheck from "@/components/verified-check";
import SaveProfileButton from "@/components/save-profile-button";
import { savedProfileIds } from "@/lib/saved-profiles";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ region?: string; service?: string; page?: string; idc?: string; exp?: string; lang?: string }>;
};

async function categoryOf(slug: string) {
  if (!isCategorySlug(slug)) return null;
  const { data } = await createAdminClient().from("categories").select("id, slug, name_en, name_ar, tagline_en, tagline_ar, status").eq("slug", slug).maybeSingle();
  return data?.status === "live" ? data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await categoryOf(slug);
  if (!category) return {};
  const t = await getTranslations({ locale, namespace: "Browse" });
  const name = locale === "ar" ? category.name_ar : category.name_en;
  const title = t("metaTitle", { service: name });
  const description = (locale === "ar" ? category.tagline_ar : category.tagline_en) ?? t("subtitle");
  return { title, description, openGraph: { title, description, siteName: "ouiKnow" } };
}

/**
 * One service's providers, open to everyone -- no account or profile
 * needed to look. Signing up is asked for only to act (message, get a
 * quote), and comes back here. Families and customers are never listed.
 */
export default async function BrowsePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const category = await categoryOf(slug);
  if (!category) {
    redirect({ href: "/", locale });
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = await getTranslations("Browse");
  const tTrades = await getTranslations("Trades");
  const tErrands = await getTranslations("ErrandServices");
  const ar = locale === "ar";
  const name = ar ? category.name_ar : category.name_en;

  // ?region=all shows all of Lebanon even when an area is remembered.
  const cookieRegion = (await cookies()).get(REGION_COOKIE)?.value || "";
  const region = sp.region === "all" ? "" : (sp.region ?? cookieRegion);
  const page = Math.max(0, Number(sp.page) || 0);
  const serviceCodes: readonly string[] = slug === "maintenance" ? TRADES : slug === "errands" ? ERRAND_SERVICES : [];
  const service = serviceCodes.includes(sp.service ?? "") ? sp.service! : "";
  const serviceLabel = (code: string) => (slug === "maintenance" ? tTrades(code as "plumber") : tErrands(code as "delivery"));
  // Trust filters: languages where the service asks for them, years everywhere but errands.
  const LANGUAGES = ["ar", "en", "fr"] as const;
  const languageLabel = (code: string) => t(`lang_${code}` as "lang_ar");
  const trustOptions = {
    years: slug !== "errands",
    languages: ["nanny", "nursing", "tutoring", "cleaning", "beauty", "car"].includes(slug) ? LANGUAGES.map((code) => ({ code, label: languageLabel(code) })) : [],
  };
  const trust = {
    idChecked: sp.idc === "1",
    minYears: trustOptions.years && Number(sp.exp) > 0 ? Math.min(30, Number(sp.exp)) : 0,
    language: trustOptions.languages.some((l) => l.code === sp.lang) ? sp.lang! : "",
  };
  const filtered = trust.idChecked || trust.minYears > 0 || !!trust.language;

  const [result, { data: places }] = await Promise.all([
    browseProviders({ slug, region: region || null, service: service || null, page, idChecked: trust.idChecked, minYears: trust.minYears, language: trust.language || null }),
    createAdminClient().from("locations").select("id, name_en, name_ar, level, parent_location_id, sort_order").in("level", ["governorate", "district"]).order("sort_order"),
  ]);
  const regions: RegionGroup[] = (places ?? [])
    .filter((p) => p.level === "governorate")
    .map((g) => ({
      id: g.id,
      name: ar ? g.name_ar : g.name_en,
      districts: (places ?? []).filter((d) => d.parent_location_id === g.id).map((d) => ({ id: d.id, name: ar ? d.name_ar : d.name_en })),
    }));

  // Whether a signed-in person already has a profile in this service.
  const { data: mine } = user
    ? await supabase.from("generic_profiles").select("id").eq("user_id", user.id).eq("category_id", category.id).neq("status", "draft").limit(1)
    : { data: null };
  const signup = (next: string) => `/signup?next=${encodeURIComponent(next)}`;
  const saved = user && result ? await savedProfileIds(supabase, user.id, result.cards.map((c) => c.id)) : new Set<string>();
  const joined = new Intl.DateTimeFormat(ar ? "ar-LB" : "en-GB", { month: "short", year: "numeric" });
  const cta =
    slug === "maintenance"
      ? { href: user ? "/quotes/new" : signup("/quotes/new"), label: t("ctaQuotes") }
      : slug === "errands"
        ? { href: user ? "/orders/new" : signup("/orders/new"), label: t("ctaOrder") }
        : { href: user ? `/categories/${slug}/onboarding?role=seeker` : signup(`/categories/${slug}/onboarding?role=seeker`), label: t("ctaRequest") };

  const more = new URLSearchParams();
  more.set("region", region || "all");
  if (service) more.set("service", service);
  if (trust.idChecked) more.set("idc", "1");
  if (trust.minYears) more.set("exp", String(trust.minYears));
  if (trust.language) more.set("lang", trust.language);
  more.set("page", String(page + 1));
  const clear = new URLSearchParams({ region: region || "all", ...(service ? { service } : {}) });

  return (
    <AppShell active={slug as never}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
        <ServiceSwitcher current={slug} />
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t("title", { service: name })}</h1>
          <p className="mt-1 text-sm text-muted">{user ? t("subtitleSignedIn") : t("subtitle")}</p>
        </div>

        {/* Both ways in, up top: need it, or offer it. (Offering used to be
            a small link below the whole list, where new providers missed it.) */}
        <div className={ui.card + " flex flex-col divide-y divide-border"}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink">{t("ctaText")}</p>
            <Link href={cta.href} className={ui.buttonPrimary + " shrink-0 text-center"}>
              {cta.label}
            </Link>
          </div>
          {(!user || !mine?.length) && (
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink">{t("offerToo", { service: name })}</p>
              <Link
                href={user ? `/categories/${slug}/onboarding?role=provider` : signup(`/categories/${slug}/onboarding?role=provider`)}
                className={ui.buttonSecondary + " shrink-0 text-center"}
              >
                {t("offerLink")}
              </Link>
            </div>
          )}
        </div>

        <BrowseFilters
          slug={slug}
          regions={regions}
          region={region}
          services={serviceCodes.map((code) => ({ code, label: serviceLabel(code) }))}
          service={service}
          trust={trust}
          trustOptions={trustOptions}
          labels={{ allLebanon: t("allLebanon"), all: t("all"), idChecked: t("idChecked"), years: t("years") }}
        />

        {result && result.total > 0 && (
          <p className="-mt-2 flex items-center gap-3 text-sm text-muted">
            <span>{t("count", { count: result.total })}</span>
            {filtered && (
              <Link href={`/browse/${slug}?${clear}`} className={ui.link}>
                {t("clearFilters")}
              </Link>
            )}
          </p>
        )}

        {result && result.cards.length === 0 && (
          <div className={ui.card + " flex flex-col items-start gap-3 p-5"}>
            <p className="font-medium text-ink">{t("emptyTitle")}</p>
            <p className="text-sm text-muted">{t("emptyBody")}</p>
            {filtered && (
              <Link href={`/browse/${slug}?${clear}`} className={ui.buttonSecondary}>
                {t("clearFilters")}
              </Link>
            )}
            {region && (
              <Link href={`/browse/${slug}?region=all${service ? `&service=${service}` : ""}`} className={ui.buttonSecondary}>
                {t("widen")}
              </Link>
            )}
          </div>
        )}

        <div className="rise-in grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result?.cards.map((c) => {
            const place = c.place ? (ar ? c.place.name_ar : c.place.name_en) : null;
            const contact = `/u/${c.id}?contact=1`;
            return (
              <div key={c.id} className={ui.cardHover + " flex min-w-0 flex-col gap-3 p-3"}>
                <Link href={`/u/${c.id}`} className="flex min-w-0 flex-wrap gap-3">
                  {c.photoUrl ? (
                    <Image src={c.photoUrl} alt="" width={72} height={72} unoptimized className="h-18 w-18 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <AvatarIllustration name={c.fullName} className="h-18 w-18 shrink-0 rounded-xl" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1 font-semibold text-ink">
                      <span className="truncate">{c.fullName}</span>
                      {c.verified && <VerifiedCheck label={t("verified")} />}
                    </p>
                    {place && <p className="truncate text-xs text-muted">{place}</p>}
                    {/* What a stranger can trust before any ratings: checked ID, experience, since when. */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      {c.rating.count > 0 ? (
                        <RatingStars average={c.rating.average} count={c.rating.count} size="xs" />
                      ) : (
                        <span className="text-muted">{t("joined", { date: joined.format(new Date(c.joinedAt)) })}</span>
                      )}
                      {c.idChecked && <span className="font-medium text-success">✓ {t("idChecked")}</span>}
                      {c.years !== null && <span className="text-ink/80">{t("yearsShort", { count: c.years })}</span>}
                    </div>
                    {c.headline && (
                      <p dir="auto" className="mt-1 line-clamp-2 text-sm text-ink/80">
                        {c.headline}
                      </p>
                    )}
                    {c.services.length > 0 && <p className="mt-1 truncate text-xs text-muted">{c.services.map(serviceLabel).join(" · ")}</p>}
                    {c.languages.length > 0 && <p className="mt-1 truncate text-xs text-muted">{t("speaks", { languages: c.languages.map(languageLabel).join(" · ") })}</p>}
                  </div>
                  {c.workPhotos.length > 0 && (
                    <div className="mt-1 grid w-full grid-cols-3 gap-1.5">
                      {c.workPhotos.map((url) => (
                        <Image key={url} src={url} alt="" width={160} height={160} unoptimized className="aspect-square w-full rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                </Link>
                <div className="flex items-center gap-2">
                  <Link href={user ? contact : signup(contact)} className={ui.buttonSecondary + " flex-1 py-2! text-center"}>
                    {t("message")}
                  </Link>
                  {user && (
                    <SaveProfileButton
                      profileId={c.id}
                      initialSaved={saved.has(c.id)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-ink transition hover:bg-surface-sunken"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {result?.more && (
          <Link href={`/browse/${slug}?${more}`} className={ui.buttonSecondary + " self-center"}>
            {t("more")}
          </Link>
        )}

        {user && !mine?.length && (
          <p className="text-center text-sm text-muted">
            {t("offerToo", { service: name })}{" "}
            <Link href={`/categories/${slug}/onboarding?role=provider`} className={ui.link}>
              {t("offerLink")}
            </Link>
          </p>
        )}
        {!user && (
          <p className="text-center text-sm text-muted">
            {t("offerToo", { service: name })}{" "}
            <Link href={signup(`/categories/${slug}/onboarding?role=provider`)} className={ui.link}>
              {t("offerLink")}
            </Link>
          </p>
        )}
      </div>
    </AppShell>
  );
}
