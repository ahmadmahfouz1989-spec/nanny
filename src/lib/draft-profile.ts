/**
 * The name on a freshly claimed profile when the account has no earlier
 * one to borrow from (see /api/generic-profile/claim). Forms show the name
 * field empty for it instead of this placeholder.
 */
export const DRAFT_NAME = "Draft profile";

/** The name a form should start with for this profile. */
export function initialFullName(p: { status: string; full_name: string }) {
  return p.status === "draft" && p.full_name === DRAFT_NAME ? "" : p.full_name;
}
