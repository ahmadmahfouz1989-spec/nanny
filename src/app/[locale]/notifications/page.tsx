import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import AppShell from "@/components/app-shell";
import { ChevronIcon } from "@/components/home-icons";
import { MegaphoneIcon } from "@/components/nav-icons";
import NotificationList, { NotificationActions } from "@/components/notifications/notification-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Notifications");
  return { title: t("title") };
}

// The phone tab bar's Notifications tab; on a computer the sidebar bell's
// dropdown shows the same list.
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const t = await getTranslations("Notifications");
  // Only for someone ouiKnow has written to; "Clear all" above doesn't touch these.
  const { count: announcements } = await supabase.from("broadcast_recipients").select("broadcast_id", { count: "exact", head: true }).eq("user_id", user!.id);
  const { count: unread } = announcements
    ? await supabase.from("broadcast_recipients").select("broadcast_id", { count: "exact", head: true }).eq("user_id", user!.id).is("read_at", null)
    : { count: 0 };

  return (
    <AppShell active="notifications">
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <NotificationActions />
        </div>
        {!!announcements && (
          <Link href="/announcements" className={ui.card + " mb-3 flex items-center gap-3 px-4 py-3 text-sm text-ink transition-colors hover:bg-surface-sunken"}>
            <MegaphoneIcon className="h-5 w-5 shrink-0 text-primary" />
            <span className="flex-1 font-semibold">{t("announcements")}</span>
            {!!unread && <span className={ui.badge("danger")}>{unread}</span>}
            <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        )}
        <div className={ui.card + " overflow-hidden"}>
          <NotificationList />
        </div>
      </div>
    </AppShell>
  );
}
