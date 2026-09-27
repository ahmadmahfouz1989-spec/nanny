import { describe, expect, it } from "vitest";
import { effectiveStatus, matchNotificationPayload, conversationUrl } from "@/lib/matching/match-access";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("effectiveStatus", () => {
  it("reads an expired pending interest as expired", () => {
    expect(effectiveStatus({ status: "seeker_interested", interestExpiresAt: past })).toBe("expired");
    expect(effectiveStatus({ status: "provider_interested", interestExpiresAt: past })).toBe("expired");
  });
  it("leaves live and settled statuses alone", () => {
    expect(effectiveStatus({ status: "seeker_interested", interestExpiresAt: future })).toBe("seeker_interested");
    expect(effectiveStatus({ status: "mutual", interestExpiresAt: past })).toBe("mutual");
    expect(effectiveStatus({ status: "declined_by_provider", interestExpiresAt: past })).toBe("declined_by_provider");
    expect(effectiveStatus({ status: "suggested", interestExpiresAt: null })).toBe("suggested");
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
