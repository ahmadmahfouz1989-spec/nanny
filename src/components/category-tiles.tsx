import { Link } from "@/i18n/navigation";
import { categoryName, categoryTagline, type Category } from "@/lib/categories";
import CategoryIcon from "@/components/category-icon";
import { BabyIcon, BookOpenIcon, ChevronIcon, DotsIcon, NurseIcon, ScooterIcon, WrenchIcon } from "@/components/home-icons";

// How each service looks wherever services are listed (Home, the services
// page), and the label set search also matches ("math" finds Tutoring).
type Look = { Icon: (p: { className?: string }) => React.ReactNode; card: string; circle: string; words?: string };

export const LOOK: Record<string, Look> = {
  nanny: { Icon: BabyIcon, card: "bg-primary-soft/60", circle: "bg-primary-soft text-primary" },
  nursing: { Icon: NurseIcon, card: "bg-secondary-soft/60", circle: "bg-secondary-soft text-secondary", words: "CareSpecialties" },
  tutoring: { Icon: BookOpenIcon, card: "bg-berry-soft/60", circle: "bg-berry-soft text-berry", words: "Subjects" },
  maintenance: { Icon: WrenchIcon, card: "bg-accent-soft/70", circle: "bg-accent-soft text-accent-hover", words: "Trades" },
  errands: { Icon: ScooterIcon, card: "bg-success-soft/60", circle: "bg-success-soft text-success", words: "ErrandServices" },
};

const OTHER: Look = { Icon: DotsIcon, card: "bg-sky-soft/70", circle: "bg-sky-soft text-sky-ink" };

function Tile({ href, look, title, note }: { href?: string; look: Look; title: string; note: string }) {
  const body = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${look.circle}`}>
        <look.Icon className="h-6 w-6" />
      </span>
      <span className="font-display text-sm font-bold leading-tight text-ink">{title}</span>
      <span className="flex items-end justify-between gap-1">
        <span className="line-clamp-2 text-[11px] leading-snug text-muted">{note}</span>
        {href && <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={`flex flex-col gap-2 rounded-2xl p-3 transition active:scale-[0.98] ${look.card}`}>
      {body}
    </Link>
  ) : (
    <div className={`flex flex-col gap-2 rounded-2xl bg-surface-sunken p-3 opacity-70`}>{body}</div>
  );
}

/**
 * The services as coloured tiles, three to a row -- the same on Home and
 * on the services page. Live services link in; with `comingSoon`, the
 * rest show greyed out with that label, and with `more`, a last tile
 * leads to the full list instead.
 */
export default function CategoryTiles({
  categories,
  locale,
  comingSoon,
  more,
}: {
  categories: Category[];
  locale: string;
  comingSoon?: string;
  more?: { title: string; note: string };
}) {
  const live = categories.filter((c) => c.status === "live" && c.href);
  const soon = comingSoon ? categories.filter((c) => !(c.status === "live" && c.href)) : [];
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
      {live.map((c) => (
        <Tile key={c.id} href={c.href!} look={LOOK[c.slug] ?? OTHER} title={categoryName(c, locale)} note={categoryTagline(c, locale)} />
      ))}
      {soon.map((c) => (
        <Tile
          key={c.id}
          look={{ ...OTHER, Icon: ({ className }) => <CategoryIcon name={c.icon} className={className} /> }}
          title={categoryName(c, locale)}
          note={comingSoon!}
        />
      ))}
      {more && <Tile href="/categories" look={OTHER} title={more.title} note={more.note} />}
    </div>
  );
}
