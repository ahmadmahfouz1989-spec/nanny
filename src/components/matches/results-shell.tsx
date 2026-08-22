import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";

export default function ResultsShell({
  title,
  backLabel,
  children,
}: {
  title: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex items-center justify-between px-6 sm:px-10 py-6">
        <BrandMark />
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <Link href="/dashboard" className={ui.link + " text-sm"}>
          {backLabel}
        </Link>
        <h1 className="font-display text-3xl font-semibold mt-3 mb-8">{title}</h1>
        {children}
      </main>
    </>
  );
}
