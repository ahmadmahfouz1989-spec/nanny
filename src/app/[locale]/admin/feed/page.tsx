import { getTranslations } from "next-intl/server";
import FeedClient from "@/app/[locale]/feed/feed-client";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { SavedProfilesProvider } from "@/components/saved-profiles-provider";

// The public feed, for moderation: admins can read every open post and
// its replies and delete any of them. Admin access itself is enforced by
// the admin layout (page) and requireAdmin (the delete routes).
// SavedProfilesProvider is normally supplied by AppShell -- FeedClient's
// profile preview depends on it (AdminShell supplies the toasts).
export default async function AdminFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; reply?: string }>;
}) {
  const { post, reply } = await searchParams;
  const t = await getTranslations("Admin");
  return (
    <>
      <AdminPageHeader title={t("feedTitle")} description={t("feedDescription")} />
      <SavedProfilesProvider>
        <FeedClient adminMode targetPostId={post ?? null} targetReplyId={reply ?? null} />
      </SavedProfilesProvider>
    </>
  );
}
