// Clicking the same feed notification twice pushes an identical URL, so
// the feed's targetPostId/targetReplyId props never change and nothing
// re-opens. The notification bell announces every feed-target click on
// this event as well; the feed re-opens the target when it matches what
// it's already showing (a changed URL is handled by the props instead).
export const FEED_TARGET_EVENT = "feed:open-target";

export type FeedTargetDetail = { postId: string; replyId: string | null };

export function announceFeedTarget(detail: FeedTargetDetail) {
  window.dispatchEvent(new CustomEvent<FeedTargetDetail>(FEED_TARGET_EVENT, { detail }));
}
