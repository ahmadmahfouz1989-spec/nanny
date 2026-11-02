import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import BrandMark from "@/components/brand-mark";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import RatingStars from "@/components/matches/rating-stars";
import type { PublicProfile } from "@/lib/public-profile";

/**
 * A provider's profile as someone without an account sees it, opened from
 * a shared link: who they are, what they do and where, their rating,
 * reviews and work -- and a way to contact them, which asks to sign up and
 * then comes straight back.
 */
export default async function PublicProfileView({ profile, locale }: { profile: PublicProfile; locale: string }) {
  const t = await getTranslations("PublicProfile");
  const tTrades = await getTranslations("Trades");
  const format = await getFormatter();
  const ar = locale === "ar";
  const service = ar ? profile.category.name_ar : profile.category.name_en;
  const place = profile.place ? (ar ? profile.place.name_ar : profile.place.name_en) : null;
  const back = `/u/${profile.id}`;
  const signup = (next: string) => `/signup?next=${encodeURIComponent(next)}`;
  const trade = profile.trades[0];

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4">
        <BrandMark />
        <Link href={`/login?next=${encodeURIComponent(back)}`} className="text-sm font-medium text-primary">
          {t("signIn")}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10">
        <section className={ui.card + " overflow-hidden"}>
          <div className="relative">
            {profile.photoUrl ? (
              <>
                <Image src={profile.photoUrl} alt="" width={960} height={480} unoptimized priority className="h-64 w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-transparent" />
              </>
            ) : (
              <AvatarIllustration tone="primary" banner className="h-44 w-full" />
            )}
            <div className="absolute bottom-0 start-0 end-0 p-4">
              <h1 className="font-display text-2xl font-bold text-white drop-shadow">{profile.fullName}</h1>
              <p className="text-sm text-white/90 drop-shadow">{place ? t("serviceIn", { service, place }) : service}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {profile.headline && (
              <p dir="auto" className="text-[15px] font-medium text-ink">
                {profile.headline}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {profile.rating.count > 0 ? <RatingStars average={profile.rating.average} count={profile.rating.count} /> : <span>{t("new")}</span>}
              {profile.idChecked && <span className={ui.badge("success")}>✓ {t("idChecked")}</span>}
              {profile.yearsExperience && <span>{t("years", { years: profile.yearsExperience })}</span>}
            </div>
            {profile.trades.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.trades.map((x) => (
                  <span key={x} className={ui.badge("secondary")}>
                    {tTrades(x as "plumber")}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href={signup(back)} className={ui.buttonPrimary + " flex-1 text-center"}>
                {t("message", { name: profile.fullName.split(" ")[0] ?? profile.fullName })}
              </Link>
              {trade && (
                <Link href={signup(`/quotes/new?trade=${trade}`)} className={ui.buttonSecondary + " flex-1 text-center"}>
                  {t("getQuote")}
                </Link>
              )}
            </div>
            <p className="text-xs text-muted">{t("signupHint")}</p>
          </div>
        </section>

        {profile.intro && (
          <section className={ui.card + " p-4"}>
            <h2 className="mb-2 font-semibold text-ink">{t("about")}</h2>
            <p dir="auto" className="whitespace-pre-line text-sm text-ink/90">
              {profile.intro}
            </p>
          </section>
        )}

        {profile.workPhotos.length > 0 && (
          <section className={ui.card + " p-4"}>
            <h2 className="mb-3 font-semibold text-ink">{t("work")}</h2>
            <div className="grid grid-cols-3 gap-2">
              {profile.workPhotos.map((p) => (
                <Image key={p.url} src={p.url} alt={p.caption ?? ""} width={300} height={300} unoptimized className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          </section>
        )}

        {profile.reviews.length > 0 && (
          <section className={ui.card + " flex flex-col gap-3 p-4"}>
            <h2 className="font-semibold text-ink">{t("reviews")}</h2>
            {profile.reviews.map((r, i) => (
              <div key={i} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <p className="text-sm text-accent">{"★".repeat(Math.round(r.score))}</p>
                <p dir="auto" className="text-sm text-ink/90">
                  {r.comment}
                </p>
              </div>
            ))}
          </section>
        )}

        <p className="text-center text-xs text-muted">
          {t("memberSince", { date: format.dateTime(new Date(profile.memberSince), { month: "long", year: "numeric" }) })}
        </p>

        <section className={ui.card + " flex flex-col items-center gap-2 p-5 text-center"}>
          <p className="font-semibold text-ink">{t("pitchTitle")}</p>
          <p className="text-sm text-muted">{t("pitchBody")}</p>
          <Link href="/" className={ui.buttonSecondary}>
            {t("explore")}
          </Link>
        </section>
      </main>
    </div>
  );
}
