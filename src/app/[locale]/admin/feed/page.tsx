import FeedClient from "@/app/[locale]/feed/feed-client";
import { ToastProvider } from "@/components/toast-provider";
import { SavedProfilesProvider } from "@/components/saved-profiles-provider";

// The public feed, for moderation: admins can read every open post and
// its replies and delete any of them. Admin access itself is enforced by
// the admin layout (page) and requireAdmin (the delete routes). The
// providers are the ones AppShell normally supplies -- FeedClient's
// profile preview depends on them.
export default async function AdminFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; reply?: string }>;
}) {
  const { post, reply } = await searchParams;
  return (
    <ToastProvider>
      <SavedProfilesProvider>
        <FeedClient adminMode targetPostId={post ?? null} targetReplyId={reply ?? null} />
      </SavedProfilesProvider>
    </ToastProvider>
  );
}
