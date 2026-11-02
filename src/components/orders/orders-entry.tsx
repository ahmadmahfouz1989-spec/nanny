import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { BoxIcon } from "@/components/nav-icons";
import { createClient } from "@/lib/supabase/server";

/**
 * On the Delivery & Errands dashboard: the way into orders. An approved
 * rider sees whether they're receiving orders -- a new rider starts
 * Offline, and nothing reaches them until they switch.
 */
export default async function OrdersEntry() {
  const t = await getTranslations("Orders");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: category } = user ? await supabase.from("categories").select("id").eq("slug", "errands").maybeSingle() : { data: null };
  const { data: rider } =
    user && category
      ? await supabase
          .from("generic_profiles")
          .select("available_now")
          .eq("user_id", user.id)
          .eq("category_id", category.id)
          .eq("role", "provider")
          .eq("moderation_status", "approved")
          .neq("status", "draft")
          .limit(1)
          .maybeSingle()
      : { data: null };

  if (rider) {
    const offline = !rider.available_now;
    return (
      <Link
        href="/orders?tab=provider"
        className={(offline ? "border-primary/40 bg-primary/5 " : "") + ui.cardHover + " flex items-center gap-3 p-4"}
      >
        <BoxIcon className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? "bg-muted" : "bg-success"}`} />
            {offline ? t("entryOfflineTitle") : t("entryAvailableTitle")}
          </p>
          <p className="text-sm text-muted">{offline ? t("entryOfflineHint") : t("entryAvailableHint")}</p>
        </div>
        <span aria-hidden="true" className="text-muted rtl:rotate-180">
          →
        </span>
      </Link>
    );
  }

  return (
    <Link href="/orders" className={ui.cardHover + " flex items-center gap-3 p-4"}>
      <BoxIcon className="h-8 w-8 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t("deliveryTitle")}</p>
        <p className="text-sm text-muted">{t("deliverySubtitle")}</p>
      </div>
      <span aria-hidden="true" className="text-muted rtl:rotate-180">
        →
      </span>
    </Link>
  );
}

/**
 * On the Home Maintenance dashboard: "Get quotes" for someone with a job,
 * or the job requests reaching an approved tradesperson.
 */
export async function JobsEntry() {
  const t = await getTranslations("Orders");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: category } = user ? await supabase.from("categories").select("id").eq("slug", "maintenance").maybeSingle() : { data: null };
  const { data: pro } =
    user && category
      ? await supabase
          .from("generic_profiles")
          .select("id")
          .eq("user_id", user.id)
          .eq("category_id", category.id)
          .eq("role", "provider")
          .eq("moderation_status", "approved")
          .neq("status", "draft")
          .limit(1)
          .maybeSingle()
      : { data: null };

  return (
    <div className="flex flex-col gap-3">
      <Link href="/quotes/new" className={"border-primary/40 bg-primary/5 " + ui.cardHover + " flex items-center gap-3 p-4"}>
        <BoxIcon className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t("entryJobsTitle")}</p>
          <p className="text-sm text-muted">{t("entryJobsHint")}</p>
        </div>
        <span aria-hidden="true" className="text-muted rtl:rotate-180">
          →
        </span>
      </Link>
      {pro && (
        <Link href="/orders?tab=provider" className={ui.cardHover + " flex items-center gap-3 p-4"}>
          <BoxIcon className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{t("entryProJobsTitle")}</p>
            <p className="text-sm text-muted">{t("entryProJobsHint")}</p>
          </div>
          <span aria-hidden="true" className="text-muted rtl:rotate-180">
            →
          </span>
        </Link>
      )}
    </div>
  );
}
