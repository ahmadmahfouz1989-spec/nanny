import { Link } from "@/i18n/navigation";
import CategoryIcon from "@/components/category-icon";
import { categoryName, categoryTagline, type Category } from "@/lib/categories";
import { ui } from "@/lib/ui";

export default function CategoryGrid({
  categories,
  locale,
  comingSoonLabel,
}: {
  categories: Category[];
  locale: string;
  comingSoonLabel: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const live = c.status === "live" && c.href;
        const inner = (
          <>
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${
                live ? "bg-primary-soft text-primary" : "bg-surface-sunken text-muted"
              }`}
            >
              <CategoryIcon name={c.icon} className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-ink">{categoryName(c, locale)}</p>
              <p className="text-sm text-muted truncate">{categoryTagline(c, locale)}</p>
            </div>
            {live ? (
              <span className="ms-auto self-center text-muted transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                <svg viewBox="0 0 20 20" className="h-4 w-4 rtl:scale-x-[-1]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              <span className={ui.badge("secondary") + " ms-auto shrink-0 self-start"}>{comingSoonLabel}</span>
            )}
          </>
        );

        return live ? (
          <Link
            key={c.id}
            href={c.href!}
            className={`group ${ui.cardHover} hover:border-primary/40 flex items-center gap-3 p-4`}
          >
            {inner}
          </Link>
        ) : (
          <div key={c.id} className={`group ${ui.card} flex items-center gap-3 p-4 opacity-70`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
