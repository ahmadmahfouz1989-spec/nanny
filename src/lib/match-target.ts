// Same idea as feed-target.ts, for match notifications: clicking one
// while already on the dashboard it points at can push an identical URL,
// which changes no props. The bell announces the match on this event too,
// so the results list can refresh statuses and scroll to it regardless.
export const MATCH_TARGET_EVENT = "matches:open-target";

export type MatchTargetDetail = { matchId: string };

export function announceMatchTarget(detail: MatchTargetDetail) {
  window.dispatchEvent(new CustomEvent<MatchTargetDetail>(MATCH_TARGET_EVENT, { detail }));
}
