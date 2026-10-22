import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { categoryName, categoryTagline, getCategories } from "@/lib/categories";
import { normalizeServiceText } from "@/lib/service-text";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import {
  BabyIcon,
  BookOpenIcon,
  ChevronIcon,
  DotsIcon,
  FlagReportIcon,
  FreeIcon,
  LockIcon,
  NurseIcon,
  PersonIcon,
  ProviderIcon,
  ScooterIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "@/components/home-icons";
import ServiceSearch, { type SearchableService } from "./service-search";

// How each service looks on Home, and the labels search also matches
// ("math" finds Tutoring, "plumber" Home maintenance, "moto taxi" Delivery
// & Errands).
const LOOK: Record<string, { Icon: (p: { className?: string }) => React.ReactNode; card: string; circle: string; words?: string }> = {
  nanny: { Icon: BabyIcon, card: "bg-primary-soft/60", circle: "bg-primary-soft text-primary" },
  nursing: { Icon: NurseIcon, card: "bg-secondary-soft/60", circle: "bg-secondary-soft text-secondary", words: "CareSpecialties" },
  tutoring: { Icon: BookOpenIcon, card: "bg-berry-soft/60", circle: "bg-berry-soft text-berry", words: "Subjects" },
  maintenance: { Icon: WrenchIcon, card: "bg-accent-soft/70", circle: "bg-accent-soft text-accent-hover", words: "Trades" },
  errands: { Icon: ScooterIcon, card: "bg-success-soft/60", circle: "bg-success-soft text-success", words: "ErrandServices" },
};

function labels(namespace: string | undefined): string {
  if (!namespace) return "";
  return [en, ar]
    .flatMap((messages) => Object.values((messages as unknown as Record<string, Record<string, unknown>>)[namespace] ?? {}))
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

/** A sunny coastline with the cedar flag -- Lebanon, drawn so it themes and stays light. */
function Coastline() {
  return (
    <svg viewBox="0 0 220 120" preserveAspectRatio="xMaxYMax slice" className="absolute inset-y-0 end-0 h-full w-[60%] rtl:-scale-x-100" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe6f7" />
          <stop offset="1" stopColor="#f4efe6" />
        </linearGradient>
      </defs>
      <g>
        <rect width="220" height="120" fill="url(#sky)" />
        <circle cx="112" cy="34" r="9" fill="#f8d77a" opacity=".8" />
        <path d="M0 70 30 48l18 10 22-24 26 20 18-12 30 22 28-18 26 14 22-10v40H0Z" fill="#9db8a4" />
        <path d="M0 80 40 62l24 10 30-16 26 14 34-12 30 12 36-8v40H0Z" fill="#7d9e8a" />
        <g fill="#efe7da" stroke="#d8cbb6" strokeWidth=".6">
          <rect x="70" y="76" width="9" height="16" />
          <rect x="81" y="70" width="8" height="22" />
          <rect x="91" y="79" width="10" height="13" />
          <rect x="103" y="73" width="7" height="19" />
          <rect x="112" y="81" width="11" height="11" />
          <rect x="125" y="75" width="8" height="17" />
          <rect x="135" y="83" width="12" height="9" />
        </g>
        <path d="M0 92h220v28H0Z" fill="#5fa3c9" />
        <path d="M10 99h30M60 104h40M120 98h26M160 106h34" stroke="#cfe6f7" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
        <path d="M60 92c20 3 50 3 90 0" stroke="#e9dcc3" strokeWidth="2.5" fill="none" />
        {/* The flag: red, white with a green cedar, red. */}
        <line x1="196" y1="22" x2="196" y2="94" stroke="#8a8a8a" strokeWidth="1.4" />
        <g transform="translate(197 24) skewY(4)">
          <rect width="20" height="4" fill="#e3342f" />
          <rect y="4" width="20" height="7" fill="#fff" />
          <rect y="11" width="20" height="4" fill="#e3342f" />
          <path d="M10 5.2 7.6 9.4h4.8L10 5.2Zm0 1.4L8.4 9.6h3.2L10 6.6Z" fill="#1f8a4c" />
          <path d="M10 5 7 10h6L10 5Z" fill="#1f8a4c" />
          <rect x="9.6" y="9.8" width=".8" height="1" fill="#1f8a4c" />
        </g>
      </g>
    </svg>
  );
}

/**
 * The top of Home: search, the Lebanon banner, the services, why ouiKnow
 * is safe to use, and a way in for each side. The latest posts follow.
 */
export default async function Discover() {
  const t = await getTranslations("Discover");
  const locale = await getLocale();
  const live = (await getCategories()).filter((c) => c.status === "live" && c.href);

  const searchable: SearchableService[] = live.map((c) => ({
    slug: c.slug,
    name: categoryName(c, locale),
    href: c.href!,
    words: normalizeServiceText([c.name_en, c.name_ar, c.tagline_en, c.tagline_ar, labels(LOOK[c.slug]?.words)].join(" ")),
  }));

  const trust = [
    { Icon: ShieldCheckIcon, text: t("trustVerified") },
    { Icon: FlagReportIcon, text: t("trustReport") },
    { Icon: FreeIcon, text: t("trustFree") },
    { Icon: LockIcon, text: t("trustPrivate"), note: t("trustPrivateNote") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ServiceSearch services={searchable} />

      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-sunken min-h-36">
        <Coastline />
        {/* Blends the picture into the text side. */}
        <div className="absolute inset-y-0 start-[39%] w-24 bg-gradient-to-r from-surface-sunken via-surface-sunken/70 to-transparent rtl:bg-gradient-to-l" />
        <div className="relative z-10 flex max-w-[56%] flex-col justify-center gap-1 p-4 py-5">
          <p className="font-display text-base font-extrabold leading-tight text-secondary">
            {t("heroTitle")} <span aria-hidden>🇱🇧</span>
          </p>
          <p className="font-brand text-base font-semibold italic leading-tight text-primary">{t("heroScript")}</p>
          <svg viewBox="0 0 120 8" className="h-2 w-28 text-primary" aria-hidden>
            <path d="M2 6c30-5 80-6 116-2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>
        <p className="absolute end-4 top-3 z-10 max-w-[5.5rem] rotate-[-6deg] text-center font-brand text-xs font-semibold leading-tight text-secondary/90">
          {t("heroNote")} <span aria-hidden>♡</span>
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{t("browse")}</h2>
          <Link href="/categories" className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary">
            {t("viewAll")}
            <ChevronIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {live.map((c) => {
            const look = LOOK[c.slug] ?? { Icon: DotsIcon, card: "bg-sky-soft/70", circle: "bg-sky-soft text-sky-ink" };
            return (
              <Link key={c.id} href={c.href!} className={`flex flex-col gap-2 rounded-2xl p-3 transition active:scale-[0.98] ${look.card}`}>
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${look.circle}`}>
                  <look.Icon className="h-6 w-6" />
                </span>
                <span className="font-display text-sm font-bold leading-tight text-ink">{categoryName(c, locale)}</span>
                <span className="flex items-end justify-between gap-1">
                  <span className="line-clamp-2 text-[11px] leading-snug text-muted">{categoryTagline(c, locale)}</span>
                  <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
                </span>
              </Link>
            );
          })}
          <Link href="/categories" className="flex flex-col gap-2 rounded-2xl bg-sky-soft/70 p-3 transition active:scale-[0.98]">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-soft text-sky-ink">
              <DotsIcon className="h-6 w-6" />
            </span>
            <span className="font-display text-sm font-bold leading-tight text-ink">{t("more")}</span>
            <span className="flex items-end justify-between gap-1">
              <span className="text-[11px] leading-snug text-muted">{t("comingSoon")}</span>
              <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
            </span>
          </Link>
        </div>
      </section>

      <ul className="grid grid-cols-4 divide-x divide-border rounded-2xl border border-border bg-secondary-soft/40 py-3 rtl:divide-x-reverse">
        {trust.map(({ Icon, text, note }) => (
          <li key={text} className="flex flex-col items-center gap-1.5 px-1.5 text-center">
            <Icon className="h-6 w-6 text-secondary" />
            <span className="text-[11px] font-medium leading-tight text-ink">{text}</span>
            {note && <span className="text-[10px] leading-tight text-muted">{note}</span>}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2 rounded-2xl bg-primary-soft/50 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <PersonIcon className="h-5 w-5" />
          </span>
          <p className="font-display text-sm font-bold text-ink">{t("seekerTitle")}</p>
          <p className="flex-1 text-xs text-muted">{t("seekerBody")}</p>
          <Link href="/categories" className="inline-flex items-center justify-center gap-1 self-start rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">
            {t("seekerCta")}
            <ChevronIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl bg-secondary-soft/50 p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-soft text-secondary">
            <ProviderIcon className="h-5 w-5" />
          </span>
          <p className="font-display text-sm font-bold text-ink">{t("providerTitle")}</p>
          <p className="flex-1 text-xs text-muted">{t("providerBody")}</p>
          <Link href="/categories" className="inline-flex items-center justify-center gap-1 self-start rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-white">
            {t("providerCta")}
            <ChevronIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
