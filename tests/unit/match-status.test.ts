import { describe, expect, it } from "vitest";
import { isBlocked, matchNotificationPayload, conversationUrl } from "@/lib/matching/match-access";

describe("isBlocked", () => {
  it("treats either side's decline as a block", () => {
    expect(isBlocked("declined_by_seeker")).toBe(true);
    expect(isBlocked("declined_by_provider")).toBe(true);
  });
  it("leaves every other status open for messaging", () => {
    for (const status of ["suggested", "mutual", "seeker_interested"]) expect(isBlocked(status)).toBe(false);
  });
});

describe("match links", () => {
  it("notifications carry the match and its category", () => {
    const payload = matchNotificationPayload({ id: "m1", categorySlug: "nanny" } as never);
    expect(payload).toEqual({ generic_match_id: "m1", category_slug: "nanny" });
  });
  it("emails deep-link to the conversation", () => {
    expect(conversationUrl("https://oui-know.com", "ar", "m1")).toBe("https://oui-know.com/ar/messages?match=m1");
  });
});
