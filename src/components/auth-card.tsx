import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BrandMark from "./brand-mark";
import LocaleSwitcher from "./locale-switcher";
import ThemeSwitcher from "./theme-switcher";
import ReadingIllustration from "./illustrations/reading-illustration";
import { ui } from "@/lib/ui";

export default function AuthCard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");

  return (
    <main className="relative flex-1 flex items-center justify-center px-6 py-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-primary-soft blur-3xl opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-secondary-soft blur-3xl opacity-70"
      />

      <div className="absolute top-6 start-6">
        <Link href="/" className={ui.link + " text-sm"}>
          {t("backToHome")}
        </Link>
      </div>

      <div className="absolute top-6 end-6 flex items-center gap-3">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-2">
          <BrandMark />
        </div>
        <ReadingIllustration className="w-40 mx-auto mb-2" />
        <div className="rounded-3xl border border-border bg-surface shadow-[0_1px_2px_rgba(30,20,10,0.04),0_24px_48px_-24px_rgba(30,20,10,0.25)] p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
