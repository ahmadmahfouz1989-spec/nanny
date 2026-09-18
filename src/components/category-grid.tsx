import { Link } from "@/i18n/navigation";
import CategoryIcon from "@/components/category-icon";
import { categoryName, categoryTagline, type Category } from "@/lib/categories";
import { ui } from "@/lib/ui";

export default function CategoryGrid({
  categories,
  locale,
  comingSoonLabel,
  exploreLabel,
}: {
  categories: Category[];
  locale: string;
  comingSoonLabel: string;
  exploreLabel: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const live = c.status === "live" && c.href;
        const inner = (
          <>
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-110 ${
                live ? "bg-primary-soft text-primary" : "bg-surface-sunken text-muted"
              }`}
            >
              <CategoryIcon name={c.icon} className="h-7 w-7" />
            </span>
            <div className="flex-1">
              <p className="font-display text-xl font-bold text-ink mb-1.5">{categoryName(c, locale)}</p>
              <p className="text-sm text-muted leading-relaxed">{categoryTagline(c, locale)}</p>
            </div>
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                {exploreLabel}
                <svg viewBox="0 0 20 20" className="h-4 w-4 rtl:scale-x-[-1]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className={ui.badge("secondary") + " self-start"}>{comingSoonLabel}</span>
            )}
          </>
        );

        return live ? (
          <Link
            key={c.id}
            href={c.href!}
            className={`group ${ui.cardHover} hover:border-primary/40 flex flex-col gap-4 p-6`}
          >
            {inner}
          </Link>
        ) : (
          <div key={c.id} className={`group ${ui.card} flex flex-col gap-4 p-6 opacity-70`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
