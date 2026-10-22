"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { lastCategory } from "@/lib/last-category";
import BrandMark from "@/components/brand-mark";
import SettingsRows from "@/components/settings-rows";
import CategoryIcon from "@/components/category-icon";
import { BellIcon, ProfileIcon, UsersIcon } from "@/components/nav-icons";
import {
  BookmarkIcon,
  BriefcaseIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronIcon,
  ClipboardIcon,
  CloseIcon,
  GearIcon,
  PersonIcon,
  PinIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  WhatsAppIcon,
} from "@/components/home-icons";
import { rememberRegion } from "@/lib/region";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { BackArrow, useGoBack } from "@/components/back-button";
import { isTabRoot, useDrawerSwipe } from "./drawer-swipe";

export type ShellService = { slug: string; icon: string; label: string };
export type ShellMe = {
  name: string | null;
  photoUrl: string | null;
  /** The profile others see first (/u/[id]). */
  profileId: string | null;
  /** Your area, in this language. */
  place: string | null;
  verified: boolean;
};

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

/** Logo, wordmark and tagline -- the top of Home and of the menu. */
function BrandLockup() {
  const t = useTranslations("Nav");
  return (
    <span className="flex items-center gap-2">
      <Image src="/images/brand-mark.png" alt="" width={32} height={32} className="shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-brand text-xl font-bold tracking-tight text-ink">ouiKnow</span>
        <span className="mt-0.5 whitespace-nowrap text-[10px] text-muted">{t("tagline")}</span>
      </span>
    </span>
  );
}

const TONES = {
  primary: "bg-primary-soft text-primary",
  secondary: "bg-secondary-soft text-secondary",
  berry: "bg-berry-soft text-berry",
  accent: "bg-accent-soft text-accent-hover",
  sky: "bg-sky-soft text-sky-ink",
  neutral: "bg-surface-sunken text-ink/70",
} as const;

function RowIcon({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>{children}</span>;
}

function RowText({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-semibold text-[15px] text-ink">{title}</span>
      <span className="block truncate text-xs text-muted">{hint}</span>
    </span>
  );
}

const MENU_ROW = "flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start transition-colors hover:bg-surface-sunken";
const SETTING_ROW = "flex w-full items-center gap-3 py-3 text-[15px] text-ink";

/**
 * The area picker at the top of Home. Matches starts on the area you pick
 * (see lib/region); the native picker opens over the label.
 */
function RegionPicker({ initial }: { initial: string }) {
  const t = useTranslations("Discover");
  const locale = useLocale();
  const [options, setOptions] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    fetch("/api/locations?level=governorate")
      .then((res) => res.json())
      .then((body) => setOptions(body.locations ?? []))
      .catch(() => {});
  }, []);

  const current = options.find((o) => o.id === value);
  const label = current ? (locale === "ar" ? current.name_ar : current.name_en) : t("allLebanon");

  return (
    <label className="relative inline-flex min-w-0 items-center gap-0.5 rounded-full py-1.5 text-[13px] font-semibold text-ink">
      <PinIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted" />
      <select
        aria-label={t("regionLabel")}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          rememberRegion(e.target.value);
        }}
        className="absolute inset-0 opacity-0"
      >
        <option value="">{t("allLebanon")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {locale === "ar" ? o.name_ar : o.name_en}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The phone's top bar, and the menu behind your photo. On the tab screens
 * the bar shows the logo (with the area picker on Home) and your photo;
 * on every page opened from them, a back arrow instead. The menu holds
 * everything that isn't a tab: your profile, services, requests, saved
 * people, settings and help. On the tab screens, swiping toward it opens
 * it too.
 */
export function MobileHeader({
  me,
  services,
  region,
}: {
  me: ShellMe | null;
  services: ShellService[];
  /** The area picked on Home, from its cookie. */
  region: string;
}) {
  const t = useTranslations("Nav");
  const tm = useTranslations("Menu");
  const [menuOpen, setMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const pathname = usePathname();
  const tabRoot = isTabRoot(pathname);
  const goBack = useGoBack();
  const drawer = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useDrawerSwipe({ enabled: tabRoot, open: menuOpen, setOpen: setMenuOpen, drawer, backdrop });

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const close = () => setMenuOpen(false);
  const chevron = <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />;

  return (
    <>
      <header className="app-chrome-top sm:hidden fixed top-0 inset-x-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 px-4 pt-[env(safe-area-inset-top)] border-b border-border bg-background/90 backdrop-blur">
        {tabRoot ? (
          <>
            <Link href="/feed" className="shrink-0">
              <BrandLockup />
            </Link>
            <span className="min-w-0 flex-1 flex justify-end">
              {pathname === "/feed" && <RegionPicker initial={region} />}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("menu")}
              aria-expanded={menuOpen}
              className="shrink-0 rounded-full ring-1 ring-border"
            >
              <Avatar me={me} size={36} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={goBack}
              aria-label={t("back")}
              className="-ms-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-surface-sunken"
            >
              <BackArrow className="h-6 w-6" />
            </button>
            <span className="flex-1 flex justify-center">
              <BrandMark />
            </span>
            <span className="w-9 shrink-0" />
          </>
        )}
      </header>

      <div
        ref={backdrop}
        className={`sm:hidden fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden
      />
      <aside
        ref={drawer}
        inert={!menuOpen}
        aria-label={t("menu")}
        className={`sm:hidden fixed inset-y-0 start-0 z-50 flex w-[86%] max-w-[22rem] flex-col overflow-y-auto overscroll-contain bg-background shadow-xl transition-transform duration-200 ease-out pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] ${
          menuOpen ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-5">
          <BrandLockup />
          <button
            type="button"
            onClick={close}
            aria-label={t("closeMenu")}
            className="-me-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {/* You: how others see you, and a shortcut to change your photo. */}
        <div className="mx-5 mt-5 flex items-center gap-3 border-b border-border pb-4">
          <Link href="/profile" onClick={close} aria-label={tm("changePhoto")} className="relative shrink-0">
            <Avatar me={me} size={64} />
            <span className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-ink text-background">
              <CameraIcon className="h-3.5 w-3.5" />
            </span>
          </Link>
          <Link href={me?.profileId ? `/u/${me.profileId}` : "/categories"} onClick={close} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg font-bold text-ink">{me?.name ?? t("profile")}</span>
              {/* Says where this goes: the edit page is the row below. */}
              <span className="block text-xs font-medium text-primary">{me?.profileId ? tm("viewPublic") : tm("createProfile")}</span>
              {me?.place && (
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <PinIcon className="h-3.5 w-3.5" />
                  <span className="truncate">{me.place}</span>
                </span>
              )}
              {me?.verified && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-secondary-soft px-2 py-0.5 text-xs font-medium text-secondary">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  {tm("verified")}
                </span>
              )}
            </span>
            {chevron}
          </Link>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-3">
          <Link href="/profile" onClick={close} className={MENU_ROW}>
            <RowIcon tone="primary"><PersonIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("myProfile")} hint={tm("myProfileHint")} />
            {chevron}
          </Link>
          <Link href="/categories" onClick={close} className={MENU_ROW}>
            <RowIcon tone="secondary"><SearchIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("findService")} hint={tm("findServiceHint")} />
            {chevron}
          </Link>
          <button type="button" onClick={() => setServicesOpen((v) => !v)} aria-expanded={servicesOpen} className={MENU_ROW}>
            <RowIcon tone="berry"><BriefcaseIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("myServices")} hint={tm("myServicesHint")} />
            <ChevronDownIcon className={`h-5 w-5 shrink-0 text-muted transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
          </button>
          {servicesOpen && (
            <div className="ms-14 flex flex-col">
              {services.map((s) => (
                <Link key={s.slug} href={`/categories/${s.slug}/dashboard`} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] text-ink hover:bg-surface-sunken">
                  <CategoryIcon name={s.icon} className="h-5 w-5 text-muted" />
                  {s.label}
                </Link>
              ))}
              <Link href="/categories" onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] font-medium text-primary hover:bg-surface-sunken">
                <span className="flex h-5 w-5 items-center justify-center text-lg leading-none">+</span>
                {tm("addService")}
              </Link>
            </div>
          )}
          <Link href="/requests" onClick={close} className={MENU_ROW}>
            <RowIcon tone="accent"><ClipboardIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("myRequests")} hint={tm("myRequestsHint")} />
            {chevron}
          </Link>
          <Link href="/saved" onClick={close} className={MENU_ROW}>
            <RowIcon tone="sky"><BookmarkIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("saved")} hint={tm("savedHint")} />
            {chevron}
          </Link>
          <Link href="/settings" onClick={close} className={MENU_ROW}>
            <RowIcon tone="neutral"><GearIcon className="h-[22px] w-[22px]" /></RowIcon>
            <RowText title={tm("settings")} hint={tm("settingsHint")} />
            {chevron}
          </Link>
        </nav>

        <div className="mx-5 border-t border-border pt-4">
          <Link
            href="/feed?compose=1"
            onClick={close}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-hover active:scale-[0.98]"
          >
            <SendIcon className="h-5 w-5 rtl:scale-x-[-1]" />
            {tm("postRequest")}
          </Link>
          <p className="mt-2 text-center text-xs text-muted">{tm("postRequestHint")}</p>
        </div>

        <div className="mx-5 mt-3 divide-y divide-border border-t border-border">
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={SETTING_ROW}>
            <WhatsAppIcon className="h-[22px] w-[22px] text-[#25D366]" />
            <span className="flex-1">{tm("contactWhatsapp")}</span>
            {chevron}
          </a>
          <SettingsRows rowClassName={SETTING_ROW} />
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
    <Link href="/notifications" replace className={className + (active ? " font-semibold text-primary" : " text-muted")}>
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

/**
 * Matches in the phone tab bar: the dashboard of the service you were last
 * in. Read when tapped, not when the page was drawn -- picking another
 * service on Profile changes it without a reload.
 */
export function MatchesTabItem({
  href,
  slugs,
  active,
  className,
}: {
  href: string;
  slugs: string[];
  active: boolean;
  className: string;
}) {
  const t = useTranslations("Nav");
  const router = useRouter();
  return (
    <Link
      href={href}
      replace
      onClick={(e) => {
        const last = lastCategory();
        const target = last && slugs.includes(last) ? `/categories/${last}/dashboard` : null;
        if (target && target !== href) {
          e.preventDefault();
          router.replace(target);
        }
      }}
      className={className + (active ? " font-semibold text-primary" : " text-muted")}
    >
      <UsersIcon className="h-[22px] w-[22px]" />
      {t("matches")}
    </Link>
  );
}
