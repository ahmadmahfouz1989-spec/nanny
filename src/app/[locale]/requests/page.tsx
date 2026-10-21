import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import AppShell from "@/components/app-shell";
import MyPostsCard from "@/components/my-posts-card";
import { SendIcon } from "@/components/home-icons";

/** My Requests: the "Looking for" posts you made, and their replies. */
export default async function RequestsPage() {
  const t = await getTranslations("Requests");
  const tm = await getTranslations("Menu");

  return (
    <AppShell active="feed">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted mb-6">{t("subtitle")}</p>
        <MyPostsCard kind="looking_for" title="" empty={t("empty")} />
        <Link
          href="/feed?compose=1"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-hover"
        >
          <SendIcon className="h-5 w-5 rtl:scale-x-[-1]" />
          {tm("postRequest")}
        </Link>
      </div>
    </AppShell>
  );
}
