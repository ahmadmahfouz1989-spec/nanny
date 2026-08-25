import BrandMark from "@/components/brand-mark";
import LocaleSwitcher from "@/components/locale-switcher";
import ThemeSwitcher from "@/components/theme-switcher";
import SignOutButton from "@/components/sign-out-button";
import InboxLink from "@/components/matches/inbox-link";
import WaveDivider from "@/components/wave-divider";
import Sparkle from "@/components/illustrations/sparkle";
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
      <div className="relative bg-sky-soft overflow-hidden">
        <Sparkle className="hidden sm:block absolute bottom-14 end-[10%] h-4 w-4 text-primary opacity-70" />
        <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6">
          <BrandMark />
          <div className="flex items-center gap-3">
            <InboxLink />
            <ThemeSwitcher />
            <LocaleSwitcher />
            <SignOutButton />
          </div>
        </header>

        <div className="relative max-w-2xl mx-auto w-full px-6 pt-4 pb-16">
          <Link href="/dashboard" className={ui.buttonGhost + " -ms-4 text-secondary! hover:text-ink!"}>
            {backLabel}
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase mt-2">{title}</h1>
        </div>

        <WaveDivider className="text-background" />
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 pt-6 pb-10">{children}</main>
    </>
  );
}
