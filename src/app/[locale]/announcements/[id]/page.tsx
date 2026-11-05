import { getFormatter, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import AppShell from "@/components/app-shell";
import MarkAnnouncementRead from "./mark-read";

/** The full message, where tapping the push notification lands. */
export default async function AnnouncementPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=/${locale}/announcements/${id}`, locale });

  // Row-level security: only someone it was sent to gets a row back.
  const { data: message } = /^[0-9a-f-]{36}$/i.test(id) ? await supabase.from("broadcasts").select("id, title, body, created_at").eq("id", id).maybeSingle() : { data: null };
  if (!message) redirect({ href: "/announcements", locale });

  const t = await getTranslations("Announcements");
  const format = await getFormatter();

  return (
    <AppShell active="notifications">
      <MarkAnnouncementRead id={id} />
      <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/announcements" className={ui.link + " text-sm"}>
          {t("all")}
        </Link>
        <article className={ui.card + " mt-4 p-5 sm:p-6"}>
          <p className={ui.eyebrow}>{t("from")}</p>
          <h1 dir="auto" className="mt-2 font-display text-2xl font-bold break-words">
            {message!.title}
          </h1>
          <p className="mt-1 text-xs text-muted">{format.dateTime(new Date(message!.created_at), { dateStyle: "long", timeStyle: "short" })}</p>
          <p dir="auto" className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
            {message!.body}
          </p>
        </article>
      </div>
    </AppShell>
  );
}
