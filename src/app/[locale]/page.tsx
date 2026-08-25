import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import SignOutButton from "@/components/sign-out-button";
import WaveDivider from "@/components/wave-divider";
import Sparkle from "@/components/illustrations/sparkle";
import CreateProfileIllustration from "@/components/illustrations/create-profile-illustration";
import MatchIllustration from "@/components/illustrations/match-illustration";
import ConnectIllustration from "@/components/illustrations/connect-illustration";
import PreviewProfileCard from "@/components/preview-profile-card";
import { ui } from "@/lib/ui";

export default async function Home() {
  const t = await getTranslations("Home");
  const tNav = await getTranslations("Nav");
  const tPreview = await getTranslations("Preview");

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
    {
      name: "Layla",
      area: "Achrafieh",
      tone: "primary" as const,
      rateLabel: tPreview("rate1"),
      years: 5,
      availableDays: ["mon", "tue", "wed", "thu", "fri"],
    },
    {
      name: "Maya",
      area: "Jounieh",
      tone: "secondary" as const,
      rateLabel: tPreview("rate2"),
      years: 3,
      availableDays: ["mon", "wed", "fri", "sat"],
    },
    {
      name: "Sara",
      area: "Hazmieh",
      tone: "berry" as const,
      rateLabel: tPreview("rate3"),
      years: 2,
      availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    },
  ];

  return (
    <>
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <nav className="flex items-center gap-3">
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
              <Link href="/signup" className={ui.buttonSecondary + " px-5! py-2! text-sm"}>
                {tNav("signup")}
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="relative bg-sky pt-6 pb-32 sm:pb-40 px-6 overflow-hidden">
        <Sparkle className="hidden sm:block absolute top-24 start-[8%] h-6 w-6 text-accent opacity-80" />
        <Sparkle className="hidden sm:block absolute top-1/2 end-[6%] h-4 w-4 text-primary opacity-70" />
        <Sparkle className="hidden sm:block absolute bottom-20 start-[20%] h-3 w-3 text-berry opacity-70" />

        <div className="relative max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-start gap-5">
            <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-semibold text-secondary">
              {t("badge")}
            </span>
            <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight text-balance leading-[0.98]">
              {t.rich("headline", {
                mark: (chunks) => (
                  <span className="inline-block bg-accent text-ink px-2 -rotate-1 rounded">{chunks}</span>
                ),
              })}
            </h1>
            <p className="text-lg text-ink/70 max-w-md text-balance">{t("subhead")}</p>

            <ul className="flex flex-col gap-2 items-start text-start">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm font-medium text-ink/80">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  {bullet}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              <Link href="/signup?role=parent" className={ui.buttonPrimary + " text-base px-7! py-3.5!"}>
                {t("ctaParent")}
              </Link>
              <Link href="/signup?role=nanny" className={ui.buttonSecondary + " text-base px-7! py-3.5!"}>
                {t("ctaNanny")}
              </Link>
            </div>
          </div>

          <div className="relative w-full max-w-md mx-auto">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[2.5rem] bg-accent/50 -rotate-2"
            />
            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden border-4 border-surface shadow-[0_1px_2px_rgba(30,20,10,0.04),0_24px_48px_-16px_rgba(30,20,10,0.35)]">
              <Image
                src="/images/hero-nanny-child.jpg"
                alt={t("heroPhotoAlt")}
                fill
                priority
                sizes="(min-width: 1024px) 480px, 90vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        <WaveDivider className="text-background" />
      </section>

      <section className="relative px-6 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto flex flex-col items-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase text-center mb-3">
            {tPreview("title")}
          </h2>
          <p className="text-muted text-center max-w-lg mb-12">{tPreview("subtitle")}</p>

          <div className="grid sm:grid-cols-3 gap-5 w-full">
            {previewCards.map((card) => (
              <PreviewProfileCard key={card.name} {...card} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-accent-soft pt-16 pb-28 sm:pb-32 px-6 overflow-hidden">
        <Sparkle className="hidden sm:block absolute top-16 end-[10%] h-5 w-5 text-primary opacity-80" />
        <Sparkle className="hidden sm:block absolute bottom-32 start-[6%] h-4 w-4 text-secondary opacity-70" />

        <div className="relative max-w-4xl mx-auto flex flex-col items-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold uppercase text-center mb-12">
            {t("howItWorksTitle")}
          </h2>

          <ol className="grid sm:grid-cols-3 gap-5 w-full">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="overflow-hidden rounded-3xl border border-border bg-surface text-start shadow-[0_1px_2px_rgba(30,20,10,0.04),0_12px_32px_-20px_rgba(30,20,10,0.2)]"
              >
                <step.Illustration className="w-full h-32" />
                <div className="p-6 flex flex-col gap-2">
                  <span className="font-display text-sm text-muted">{t("stepLabel", { number: i + 1 })}</span>
                  <span className="font-display text-lg font-bold">{step.title}</span>
                  <span className="text-sm text-muted">{step.body}</span>
                </div>
              </li>
            ))}
          </ol>

          <p className="font-display text-2xl font-bold mt-16 mb-4">{t("readyTitle")}</p>
          <Link href="/signup" className={ui.buttonPrimary}>
            {tNav("signup")}
          </Link>
        </div>

        <WaveDivider className="text-background" />
      </section>

      <footer className="px-6 sm:px-10 py-8 text-center text-xs text-muted">
        {t("footer", { year: new Date().getFullYear() })}
      </footer>
    </>
  );
}
