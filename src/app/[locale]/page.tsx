import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import SignOutButton from "@/components/sign-out-button";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import MatchIllustration from "@/components/illustrations/match-illustration";
import ConnectIllustration from "@/components/illustrations/connect-illustration";
import PreviewProfileCard from "@/components/preview-profile-card";
import CategoryGrid from "@/components/category-grid";
import { getCategories } from "@/lib/categories";
import { ui } from "@/lib/ui";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Home");
  const tNav = await getTranslations("Nav");
  const tPreview = await getTranslations("Preview");
  const tCat = await getTranslations("Categories");
  const categories = await getCategories();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const steps = [
    { title: t("step1Title"), body: t("step1Body"), Illustration: CreateProfileIllustration },
    { title: t("step2Title"), body: t("step2Body"), Illustration: MatchIllustration },
    { title: t("step3Title"), body: t("step3Body"), Illustration: ConnectIllustration },
  ];

  const bullets = [t("bullet1"), t("bullet2"), t("bullet3")];

  const previewCards = [
    { name: "Layla", area: "Achrafieh", tone: "primary" as const, years: 5, availableDays: ["mon", "tue", "wed", "thu", "fri"] },
    { name: "Maya", area: "Jounieh", tone: "secondary" as const, years: 3, availableDays: ["mon", "wed", "fri", "sat"] },
    { name: "Sara", area: "Hazmieh", tone: "berry" as const, years: 2, availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
  ];

  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-5">
        <BrandMark />
        <nav className="flex items-center gap-2 sm:gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
          {user ? (
            <>
              <Link href="/dashboard" className={ui.buttonGhost}>
                {tNav("dashboard")}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={ui.buttonGhost}>
                {tNav("login")}
              </Link>
              <Link href="/signup" className={ui.buttonPrimary}>
                {tNav("signup")}
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 pt-10 pb-16 sm:pt-16 sm:pb-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-start gap-5">
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-secondary">
              {t("badge")}
            </span>
            <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
              {t.rich("headline", {
                mark: (chunks) => (
                  <span className="text-primary">{chunks}</span>
                ),
              })}
            </h1>
            <p className="text-lg text-muted max-w-md">{t("subhead")}</p>

            <ul className="flex flex-col gap-2.5 items-start text-start mt-1">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-sm text-ink/80">
                  <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {bullet}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full sm:w-auto">
              <Link href="/signup?role=parent" className={ui.buttonPrimary + " px-6! py-3!"}>
                {t("ctaParent")}
              </Link>
              <Link href="/signup?role=nanny" className={ui.buttonSecondary + " px-6! py-3!"}>
                {t("ctaNanny")}
              </Link>
            </div>
          </div>

          <div className="relative w-full max-w-md mx-auto">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border shadow-lg">
              <Image
                src="/images/hero-nanny-child.jpg"
                alt={t("heroPhotoAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 460px, 90vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-t border-border bg-surface-sunken px-6 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-2">
            {tCat("landingTitle")}
          </h2>
          <p className="text-muted text-center max-w-lg mx-auto mb-10">{tCat("landingSubtitle")}</p>
          <CategoryGrid categories={categories} locale={locale} comingSoonLabel={tCat("comingSoon")} />
          <p className="text-center text-xs text-muted mt-6">{tCat("moreComingSoon")}</p>
        </div>
      </section>

      {/* Preview */}
      <section className="border-t border-border px-6 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-3">
            {tPreview("title")}
          </h2>
          <p className="text-muted text-center max-w-lg mx-auto mb-10">{tPreview("subtitle")}</p>

          <div className="grid sm:grid-cols-3 gap-5">
            {previewCards.map((card) => (
              <PreviewProfileCard key={card.name} {...card} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface-sunken px-6 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto flex flex-col items-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
            {t("howItWorksTitle")}
          </h2>

          <ol className="grid sm:grid-cols-3 gap-5 w-full">
            {steps.map((step, i) => (
              <li key={step.title} className={ui.card + " overflow-hidden text-start"}>
                <step.Illustration className="w-full h-28" />
                <div className="p-5 flex flex-col gap-1.5">
                  <span className={ui.eyebrow}>{t("stepLabel", { number: i + 1 })}</span>
                  <span className="font-display text-lg font-bold">{step.title}</span>
                  <span className="text-sm text-muted">{step.body}</span>
                </div>
              </li>
            ))}
          </ol>

          <p className="font-display text-xl font-bold mt-14 mb-4">{t("readyTitle")}</p>
          <Link href="/signup" className={ui.buttonPrimary + " px-6! py-3!"}>
            {tNav("signup")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-6 sm:px-10 py-8 text-center text-xs text-muted">
        {t("footer", { year: new Date().getFullYear() })}
      </footer>
    </>
  );
}
