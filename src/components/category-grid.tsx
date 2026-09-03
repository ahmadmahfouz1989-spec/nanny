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
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                live ? "bg-primary-soft text-primary" : "bg-surface-sunken text-muted"
              }`}
            >
              <CategoryIcon name={c.icon} className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold text-ink">{categoryName(c, locale)}</p>
              <p className="text-sm text-muted truncate">{categoryTagline(c, locale)}</p>
            </div>
            {!live && (
              <span className={ui.badge("secondary") + " ms-auto shrink-0 self-start"}>{comingSoonLabel}</span>
            )}
          </>
        );

        return live ? (
          <Link
            key={c.id}
            href={c.href!}
            className={`${ui.card} flex items-start gap-3 p-4 transition-colors hover:border-border-strong`}
          >
            {inner}
          </Link>
        ) : (
          <div key={c.id} className={`${ui.card} flex items-start gap-3 p-4 opacity-70`}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
