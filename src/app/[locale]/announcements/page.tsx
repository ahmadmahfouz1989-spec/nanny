import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import AppShell from "@/components/app-shell";
import { ChevronIcon } from "@/components/home-icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Announcements");
  return { title: t("title") };
}

/** Everything ouiKnow has sent this person, newest first. */
export default async function AnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale });

  const t = await getTranslations("Announcements");
  const format = await getFormatter();
  const { data } = await supabase
    .from("broadcast_recipients")
    .select("read_at, created_at, broadcasts(id, title, body)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []).filter((r) => r.broadcasts);

  return (
    <AppShell active="notifications">
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <h1 className="font-display text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted mb-4">{t("subtitle")}</p>
        {items.length === 0 ? (
          <div className={ui.card + " px-4 py-8 text-center text-sm text-muted"}>{t("empty")}</div>
        ) : (
          <div className={ui.card + " overflow-hidden"}>
            {items.map((r) => (
              <Link
                key={r.broadcasts!.id}
                href={`/announcements/${r.broadcasts!.id}`}
                className={`flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 transition-colors hover:bg-surface-sunken ${r.read_at ? "" : "bg-primary-soft/30"}`}
              >
                <span className="min-w-0 flex-1">
                  <span dir="auto" className={`block truncate text-sm text-ink ${r.read_at ? "" : "font-semibold"}`}>
                    {r.broadcasts!.title}
                  </span>
                  <span dir="auto" className="block truncate text-xs text-muted">
                    {r.broadcasts!.body}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">{format.dateTime(new Date(r.created_at), { dateStyle: "medium" })}</span>
                </span>
                <ChevronIcon className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
