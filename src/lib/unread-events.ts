// Fired whenever something changes how many messages are unread (a thread
// was opened and marked read, a message arrived) so the Messages badge
// refreshes right away instead of on its next 30-second poll.
export const UNREAD_CHANGED_EVENT = "oui:unread-changed";

export function announceUnreadChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
}
