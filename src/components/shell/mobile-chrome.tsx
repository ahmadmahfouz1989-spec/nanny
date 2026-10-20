"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/brand-mark";
import ThemeSwitcher from "@/components/theme-switcher";
import LocaleSwitcher from "@/components/locale-switcher";
import SignOutButton from "@/components/sign-out-button";
import CategoryIcon from "@/components/category-icon";
import { BellIcon, BookmarkIcon, GridIcon, ProfileIcon } from "@/components/nav-icons";
import { useNotifications } from "@/components/notifications/notifications-provider";

export type ShellService = { slug: string; icon: string; label: string };
export type ShellMe = { name: string | null; photoUrl: string | null };

/** The id of AppShell's scrolling <main>, which the bars watch. */
export const APP_MAIN_ID = "app-main";

/**
 * Like X, the phone's top and bottom bars slide away while you scroll down
 * through content and come back as soon as you scroll up (or reach the
 * top). Sets html[data-chrome], which globals.css turns into the slide.
 */
export function HideOnScroll() {
  useEffect(() => {
    const main = document.getElementById(APP_MAIN_ID);
    if (!main) return;
    const root = document.documentElement;
    let last = main.scrollTop;
    function onScroll() {
      const top = main!.scrollTop;
      const delta = top - last;
      if (top < 60 || delta < -6) root.dataset.chrome = "shown";
      else if (delta > 6) root.dataset.chrome = "hidden";
      last = top;
    }
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      root.dataset.chrome = "shown";
    };
  }, []);
  return null;
}

function Avatar({ me, size }: { me: ShellMe | null; size: number }) {
  const [broken, setBroken] = useState(false);
  if (me?.photoUrl && !broken) {
    return (
      <Image
        src={me.photoUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover bg-surface-sunken"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
      style={{ width: size, height: size }}
    >
      <ProfileIcon className="h-1/2 w-1/2" />
    </span>
  );
}

/**
 * The phone's top bar: your photo (opens the menu), the logo, and Saved.
 * Everything that isn't a place you go every day -- your services, theme,
 * language, signing out -- lives in the menu instead of crowding the bar.
 */
export function MobileHeader({ me, services }: { me: ShellMe | null; services: ShellService[] }) {
  const t = useTranslations("Nav");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const close = () => setMenuOpen(false);
  const row = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-ink transition-colors hover:bg-surface-sunken";

  return (
    <>
      <header className="app-chrome-top sm:hidden fixed top-0 inset-x-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] border-b border-border bg-background/90 backdrop-blur">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("menu")}
          aria-expanded={menuOpen}
          className="justify-self-start rounded-full"
        >
          <Avatar me={me} size={34} />
        </button>
        <BrandMark />
        <Link
          href="/saved"
          aria-label={t("saved")}
          className="justify-self-end inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          <BookmarkIcon className="h-5 w-5" />
        </Link>
      </header>

      <div
        className={`sm:hidden fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden
      />
      <aside
        inert={!menuOpen}
        aria-label={t("menu")}
        className={`sm:hidden fixed inset-y-0 start-0 z-50 flex w-[82%] max-w-80 flex-col bg-background shadow-xl transition-transform duration-200 ease-out pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] ${
          menuOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
        }`}
      >
        <Link href="/profile" onClick={close} className="flex items-center gap-3 px-5 pb-4 border-b border-border">
          <Avatar me={me} size={48} />
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-bold text-ink">{me?.name ?? t("profile")}</span>
            <span className="block text-sm text-muted">{t("viewProfile")}</span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
          <Link href="/profile" onClick={close} className={row}>
            <ProfileIcon className="h-[22px] w-[22px] text-muted" />
            {t("profile")}
          </Link>
          <Link href="/saved" onClick={close} className={row}>
            <BookmarkIcon className="h-[22px] w-[22px] text-muted" />
            {t("saved")}
          </Link>
          {services.length > 0 && (
            <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{t("yourServices")}</p>
          )}
          {services.map((s) => (
            <Link key={s.slug} href={`/categories/${s.slug}/dashboard`} onClick={close} className={row}>
              <CategoryIcon name={s.icon} className="h-[22px] w-[22px] text-muted" />
              {s.label}
            </Link>
          ))}
          <Link href="/categories" onClick={close} className={row}>
            <GridIcon className="h-[22px] w-[22px] text-muted" />
            {t("allServices")}
          </Link>
        </nav>

        <div className="border-t border-border px-5 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{t("theme")}</span>
            <ThemeSwitcher />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{t("language")}</span>
            <LocaleSwitcher className="px-2" />
          </div>
          <div className="pt-1">
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}

/** Notifications in the phone tab bar, with the unread count. */
export function NotificationsTabItem({ active, className }: { active: boolean; className: string }) {
  const t = useTranslations("Notifications");
  const { unread } = useNotifications();
  return (
    <Link href="/notifications" className={className + (active ? " font-semibold text-primary" : " text-muted")}>
      <span className="relative">
        <BellIcon className="h-[22px] w-[22px]" fill={active ? "currentColor" : "none"} />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      {t("title")}
    </Link>
  );
}
