import { getTranslations } from "next-intl/server";
import AppShell from "@/components/app-shell";
import MyPostsCard from "@/components/my-posts-card";

/** My Requests: the "Looking for" posts you made, and their replies. */
export default async function RequestsPage() {
  const t = await getTranslations("Requests");

  return (
    <AppShell active="feed">
      <div className="max-w-lg w-full mx-auto px-6 py-8">
        <h1 className="font-display text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted mb-6">{t("subtitle")}</p>
        {/* Written here and shown on Home's feed, as "Looking for". */}
        <MyPostsCard kind="looking_for" title="" empty={t("empty")} placeholder={t("placeholder")} />
      </div>
    </AppShell>
  );
}
