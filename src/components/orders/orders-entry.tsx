import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { BoxIcon } from "@/components/nav-icons";

/** On the Delivery & Errands dashboard: the way into orders (ordering, or receiving them). */
export default async function OrdersEntry() {
  const t = await getTranslations("Orders");
  return (
    <Link href="/orders" className={ui.cardHover + " flex items-center gap-3 p-4"}>
      <BoxIcon className="h-8 w-8 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t("title")}</p>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </div>
      <span aria-hidden="true" className="text-muted rtl:rotate-180">
        →
      </span>
    </Link>
  );
}
