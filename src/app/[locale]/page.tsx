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
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/70 px-6 py-4 backdrop-blur-md sm:px-10">
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
      <section className="relative overflow-hidden px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
        <div
          aria-hidden
          className="oui-float pointer-events-none absolute -top-24 -start-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="oui-float-2 pointer-events-none absolute top-40 -end-28 h-72 w-72 rounded-full bg-secondary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(var(--color-border-strong)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_35%,#000,transparent)]"
        />

        <div className="relative mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-start">
            <span className="oui-in inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              {t("badge")}
            </span>
            <h1
              className="oui-in font-display text-5xl font-bold leading-[1.03] tracking-tight sm:text-7xl"
              style={{ animationDelay: "0.06s" }}
            >
              {t.rich("headline", {
                mark: (chunks) => (
                  <span className="bg-gradient-to-br from-primary to-berry bg-clip-text text-transparent">
                    {chunks}
                  </span>
                ),
              })}
            </h1>
            <p className="oui-in max-w-md text-lg text-muted" style={{ animationDelay: "0.12s" }}>
              {t("subhead")}
            </p>

            <ul className="oui-in mt-1 flex flex-col items-start gap-2.5 text-start" style={{ animationDelay: "0.18s" }}>
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-sm text-ink/80">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>

            <div
              className="oui-in mt-3 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
              style={{ animationDelay: "0.24s" }}
            >
              <Link href="/signup?role=parent" className={ui.buttonPrimary + " px-6! py-3! text-base!"}>
                {t("ctaParent")}
              </Link>
              <Link href="/signup?role=nanny" className={ui.buttonSecondary + " px-6! py-3! text-base!"}>
                {t("ctaNanny")}
              </Link>
            </div>
          </div>

          <div className="oui-in relative mx-auto w-full max-w-md" style={{ animationDelay: "0.15s" }}>
            <div className="relative aspect-[4/3] rotate-1 overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
              <Image
                src="/images/hero-nanny-child.jpg"
                alt={t("heroPhotoAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 460px, 90vw"
                className="object-cover"
              />
            </div>
            <div className="oui-float-2 absolute -start-5 top-8 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-sm font-semibold shadow-lg">
              <span className="text-accent-hover">★</span> 4.9
            </div>
            <div className="oui-float absolute -end-4 bottom-6 flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-semibold shadow-lg">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success">
                <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {t("bullet2Short")}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-t border-border bg-surface-sunken px-6 py-16 sm:py-20">
        <div className="oui-reveal mx-auto max-w-5xl">
          <h2 className="mb-2 text-center font-display text-2xl font-bold sm:text-3xl">{tCat("landingTitle")}</h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-muted">{tCat("landingSubtitle")}</p>
          <CategoryGrid categories={categories} locale={locale} comingSoonLabel={tCat("comingSoon")} />
          <p className="mt-6 text-center text-xs text-muted">{tCat("moreComingSoon")}</p>
        </div>
      </section>

      {/* Preview */}
      <section className="border-t border-border px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="oui-reveal mb-3 text-center font-display text-2xl font-bold sm:text-3xl">
            {tPreview("title")}
          </h2>
          <p className="oui-reveal mx-auto mb-10 max-w-lg text-center text-muted">{tPreview("subtitle")}</p>

          <div className="grid gap-5 sm:grid-cols-3">
            {previewCards.map((card, i) => (
              <div key={card.name} className="oui-reveal" style={{ animationDelay: `${i * 0.06}s` }}>
                <PreviewProfileCard {...card} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface-sunken px-6 py-16 sm:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center">
          <h2 className="oui-reveal mb-12 text-center font-display text-2xl font-bold sm:text-3xl">
            {t("howItWorksTitle")}
          </h2>

          <ol className="relative grid w-full gap-5 sm:grid-cols-3">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-[16%] top-9 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent sm:block"
            />
            {steps.map((step, i) => (
              <li
                key={step.title}
                className={`oui-reveal relative ${ui.cardHover} overflow-hidden text-start`}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="relative">
                  <step.Illustration className="h-28 w-full" />
                  <span className="absolute -bottom-4 start-5 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-berry text-sm font-bold text-white shadow-md">
                    {i + 1}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 p-5 pt-7">
                  <span className={ui.eyebrow}>{t("stepLabel", { number: i + 1 })}</span>
                  <span className="font-display text-lg font-bold">{step.title}</span>
                  <span className="text-sm text-muted">{step.body}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-6 py-16 sm:py-20">
        <div className="oui-reveal relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-berry px-6 py-14 text-center text-white sm:px-10">
          <div aria-hidden className="oui-float absolute -top-16 -end-10 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
          <h2 className="relative font-display text-2xl font-bold sm:text-3xl">{t("readyTitle")}</h2>
          <p className="relative mx-auto mt-2 max-w-md text-white/85">{t("subhead")}</p>
          <Link
            href="/signup"
            className="relative mt-6 inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          >
            {tNav("signup")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted sm:px-10">
        {t("footer", { year: new Date().getFullYear() })}
      </footer>
    </>
  );
}
