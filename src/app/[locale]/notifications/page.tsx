import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import AppShell from "@/components/app-shell";
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

  return (
    <AppShell active="notifications">
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
          <NotificationActions />
        </div>
        <div className={ui.card + " overflow-hidden"}>
          <NotificationList />
        </div>
      </div>
    </AppShell>
  );
}
