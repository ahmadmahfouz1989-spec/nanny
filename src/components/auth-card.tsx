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
    <main className="relative flex-1 flex items-center justify-center px-6 py-16">
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
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandMark />
          <ReadingIllustration className="w-28" />
        </div>
        <div className="rounded-2xl border border-border bg-surface shadow-md p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
