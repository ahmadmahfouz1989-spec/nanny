import { cache } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProfilePage, type ProfilePageData } from "@/lib/profile-page";
import { isCategorySlug } from "@/lib/category-slugs";
import { DAYS } from "@/lib/validation/profile";
import { formatHoursRange } from "@/lib/format-hours";
import { ui } from "@/lib/ui";
import AppShell from "@/components/app-shell";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import SaveProfileButton from "@/components/save-profile-button";
import RatingStars from "@/components/matches/rating-stars";
import MatchDetails from "@/components/matches/match-details";
import MatchActions from "@/components/matches/match-actions";
import CriteriaChecklist from "@/components/matches/criteria-checklist";
import ReportButton from "@/components/matches/report-button";
import { ReviewList } from "@/components/matches/reviews-panel";
import WorkSection from "@/components/work/work-section";
import HeadlineEditor from "@/components/work/headline-editor";
import BackButton from "@/components/back-button";
import ProfileSectionNav from "@/components/profile-section-nav";

// generateMetadata and the page both need it; cache() makes it one load.
const getPage = cache(async (id: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, data: null };
  return { user, data: await loadProfilePage(supabase, user.id, id) };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getPage(id);
  return data ? { title: data.profile.full_name } : {};
}

function localized<T extends { name_en: string; name_ar: string }>(row: T | null, locale: string) {
  if (!row) return "";
  return locale === "ar" ? row.name_ar : row.name_en;
}

/**
 * A person's profile page: everything about them in one place, with a tab
 * for each of their profiles (an account can offer nursing and tutoring,
 * or offer one service and look for another). Every name and photo in the
 * app links here. Visibility is the same as on a match card -- see
 * loadProfilePage.
 */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const { user, data } = await getPage(id);

  if (!user) {
    redirect({ href: "/login", locale });
    return;
  }

  const t = await getTranslations("ProfilePage");

  if (!data) {
    return (
      <AppShell active="feed">
        <div className="max-w-lg w-full mx-auto px-4 sm:px-6 py-10">
          <div className={ui.card + " p-6"}>
            <h1 className="font-display text-xl font-bold">{t("unavailableTitle")}</h1>
            <p className="text-sm text-muted mt-2">{t("unavailableBody")}</p>
            <Link href="/feed" className={ui.buttonSecondary + " mt-5"}>
              {t("backToFeed")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const slug = data.profile.categories?.slug ?? "";
  const active = data.isOwn ? "profile" : isCategorySlug(slug) ? slug : "feed";

  return (
    <AppShell active={active}>
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 flex flex-col gap-3 sm:gap-5">
        <BackButton fallback="/feed" className="self-start" />
        <ProfileHeader data={data} locale={locale} />
        <ProfileSectionNav sections={await sectionsFor(data)} />
        <ProfileBody data={data} locale={locale} />
      </div>
    </AppShell>
  );
}

async function ProfileHeader({ data, locale }: { data: ProfilePageData; locale: string }) {
  const t = await getTranslations("ProfilePage");
  const tMatches = await getTranslations("Matches");
  const tSaved = await getTranslations("SavedProfiles");
  const tDashboard = await getTranslations("Dashboard");
  const { profile, match } = data;
  const a = profile.attributes;
  const slug = profile.categories?.slug ?? "";
  const area = [localized(profile.locations, locale), typeof a.locationDetail === "string" ? a.locationDetail : null]
    .filter(Boolean)
    .join(", ");
  const categoryName = localized(profile.categories, locale);
  const roleLabel = profile.role === "seeker" ? tSaved("roleSeeking") : tSaved("roleOffering");

  return (
    <section className={ui.card + " overflow-hidden"}>
      <div className="relative">
        {profile.profile_photo_url ? (
          <>
            <Image
              src={profile.profile_photo_url}
              alt=""
              width={960}
              height={480}
              unoptimized
              priority
              className="h-56 sm:h-72 w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-transparent" />
          </>
        ) : (
          <AvatarIllustration
            tone={profile.role === "seeker" ? "secondary" : "primary"}
            banner
            className="h-40 sm:h-48 w-full"
          />
        )}
        {data.featured && (
          <span className="absolute top-3 start-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            <span aria-hidden>★</span>
            {tMatches("featuredBadge")}
          </span>
        )}
        {match && (
          <span className={ui.badge(ui.scoreTone(match.score)) + " absolute top-3 end-3 bg-surface/90!"}>
            {tMatches("scoreLabel", { score: Math.round(match.score) })}
          </span>
        )}
        <div className="absolute bottom-0 start-0 end-0 p-4 sm:p-5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">{profile.full_name}</h1>
          <p className="text-sm text-white/90 drop-shadow">
            {[categoryName, roleLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex flex-col gap-3">
        {data.isOwn ? (
          <HeadlineEditor profileId={profile.id} initial={profile.headline} />
        ) : (
          profile.headline && (
            <p dir="auto" className="text-[15px] font-medium text-ink">
              {profile.headline}
            </p>
          )
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {area && <span>{area}</span>}
          {data.rating.count > 0 && (
            <a href="#reviews" className="hover:opacity-80">
              <RatingStars average={data.rating.average} count={data.rating.count} />
            </a>
          )}
        </div>

        {data.isOwn ? (
          <>
            {profile.moderation_status !== "approved" && (
              <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">{t("ownNotLive")}</p>
            )}
            <p className="text-xs text-muted">{t("ownPreviewNote")}</p>
            <div>
              <Link href={`/categories/${slug}/onboarding?role=${profile.role}`} className={ui.buttonSecondary}>
                {tDashboard("editProfile")}
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {match ? (
              <MatchActions matchId={match.id} status={match.status} viewerSide={match.viewerSide} />
            ) : data.viewerCanMatch ? (
              <p className="text-sm text-muted">{t("notInMatches", { name: profile.full_name })}</p>
            ) : (
              <p className="text-sm text-muted">
                {t("createToMessage", { category: categoryName, name: profile.full_name })}{" "}
                <Link
                  href={`/categories/${slug}/onboarding?role=${profile.role === "seeker" ? "provider" : "seeker"}`}
                  className={ui.link}
                >
                  {t("getStarted")}
                </Link>
              </p>
            )}
            <SaveProfileButton
              profileId={profile.id}
              initialSaved={data.isSaved}
              className="ms-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-ink transition hover:bg-surface-sunken"
            />
          </div>
        )}
      </div>

      {data.tabs.length > 1 && <ProfileTabs data={data} locale={locale} />}
    </section>
  );
}

async function ProfileTabs({ data, locale }: { data: ProfilePageData; locale: string }) {
  const t = await getTranslations("ProfilePage");
  const tSaved = await getTranslations("SavedProfiles");

  return (
    <nav aria-label={t("profilesLabel")} className="flex gap-2 overflow-x-auto border-t border-border px-4 sm:px-5 py-3">
      {data.tabs.map((tab) => {
        // Seeking and offering in one category would otherwise get two identical tabs.
        const sharesCategory = data.tabs.some((o) => o.id !== tab.id && o.slug === tab.slug);
        const label = localized(tab, locale);
        const role = tab.role === "seeker" ? tSaved("roleSeeking") : tSaved("roleOffering");
        const current = tab.id === data.profile.id;
        return (
          <Link
            key={tab.id}
            href={`/u/${tab.id}`}
            aria-current={current ? "page" : undefined}
            className={ui.pill(current) + " shrink-0 whitespace-nowrap"}
          >
            {sharesCategory ? `${label} · ${role}` : label}
          </Link>
        );
      })}
    </nav>
  );
}

function aboutTexts(data: ProfilePageData) {
  const a = data.profile.attributes;
  return [a.shortIntro, a.jobDescription, a.familyDescription].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
}

// The sticky section bar's entries -- only sections ProfileBody shows.
async function sectionsFor(data: ProfilePageData) {
  const t = await getTranslations("ProfilePage");
  const tWork = await getTranslations("Work");
  const hasWork =
    data.profile.role === "provider" &&
    (data.isOwn || data.work.some((p) => p.status === "approved" && p.photos.length > 0));
  return [
    hasWork && { id: "work", label: tWork("title") },
    aboutTexts(data).length > 0 && { id: "about", label: t("about") },
    { id: "details", label: t("details") },
    { id: "reviews", label: t("reviews") },
  ].filter((x): x is { id: string; label: string } => !!x);
}

async function ProfileBody({ data, locale }: { data: ProfilePageData; locale: string }) {
  const t = await getTranslations("ProfilePage");
  const tDays = await getTranslations("Days");
  const { profile, match } = data;
  const a = profile.attributes;

  const about = aboutTexts(data);
  const availability = a.availability as { days?: string[]; startTime?: string; endTime?: string } | undefined;
  const days = (availability?.days ?? a.neededDays ?? []) as string[];
  const hours = formatHoursRange(availability?.startTime, availability?.endTime, locale);
  const memberSince = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(data.trust.memberSince),
  );

  return (
    <>
      {profile.role === "provider" && (
        <WorkSection profileId={profile.id} initialProjects={data.work} isOwn={data.isOwn} />
      )}

      {about.length > 0 && (
        <Section title={t("about")} id="about">
          {about.map((text, i) => (
            <p key={i} dir="auto" className="text-[15px] text-ink/85 whitespace-pre-wrap">
              {text}
            </p>
          ))}
        </Section>
      )}

      {match && Object.keys(match.breakdown).length > 0 && (
        <Section title={t("whyMatch")}>
          <CriteriaChecklist breakdown={match.breakdown} />
        </Section>
      )}

      <Section title={t("details")} id="details">
        <MatchDetails profile={profile} />
      </Section>

      {days.length > 0 && (
        <Section title={t("availability")}>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => (
              <div key={day} className={ui.dayChip(days.includes(day))}>
                {tDays(day)}
              </div>
            ))}
          </div>
          {hours && <p className="text-sm text-muted">{hours}</p>}
        </Section>
      )}

      <Section title={t("trust")}>
        <ul className="flex flex-col gap-2 text-sm">
          {data.trust.phoneVerified && <TrustRow text={t("phoneVerified")} />}
          {data.trust.emailVerified && <TrustRow text={t("emailVerified")} />}
          <TrustRow text={t("memberSince", { date: memberSince })} icon="calendar" />
        </ul>
      </Section>

      <Section title={t("reviews")} id="reviews">
        {data.rating.count > 0 && <RatingStars average={data.rating.average} count={data.rating.count} />}
        {data.rating.count > 0 ? <ReviewList reviews={data.reviews} /> : <p className="text-sm text-muted">{t("noReviews")}</p>}
      </Section>

      {!data.isOwn && (
        <div className="px-1">
          <ReportButton profileId={profile.id} matchId={match?.id} />
        </div>
      )}
    </>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={ui.card + " p-4 sm:p-5 flex flex-col gap-3 scroll-mt-32 sm:scroll-mt-20"}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function TrustRow({ text, icon = "check" }: { text: string; icon?: "check" | "calendar" }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
          icon === "check" ? "bg-success-soft text-success" : "bg-surface-sunken text-muted"
        }`}
      >
        {icon === "check" ? "✓" : "◷"}
      </span>
      {text}
    </li>
  );
}
