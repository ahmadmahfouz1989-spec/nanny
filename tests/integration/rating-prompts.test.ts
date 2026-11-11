import { afterAll, describe, expect, it, vi } from "vitest";
import { pendingRatings } from "@/lib/rating-prompts";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER } from "./helpers";

vi.mock("@/lib/categories", async () => {
  const { admin: db } = await import("./helpers");
  return {
    getCategories: async () => (await db.from("categories").select("id, slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order")).data ?? [],
  };
});

afterAll(cleanupUsers);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// "How was it with Rita?" on Home: customers are asked to rate providers
// they really talked to, a couple of days in, once.
describe("asking customers for a rating", () => {
  it("asks about a two-way conversation two days old, not a newer or one-sided one, and stops once rated", async () => {
    const [parent, rita, sara, lina] = await Promise.all([createUser("rp-parent"), createUser("rp-rita"), createUser("rp-sara"), createUser("rp-lina")]);
    const seeker = await createProfile(parent, "nanny", "seeker", NANNY_SEEKER);
    const [ritaP, saraP, linaP] = await Promise.all([
      createProfile(rita, "nanny", "provider", NANNY_PROVIDER, { fullName: "Rita Talked" }),
      createProfile(sara, "nanny", "provider", NANNY_PROVIDER, { fullName: "Sara Recent" }),
      createProfile(lina, "nanny", "provider", NANNY_PROVIDER, { fullName: "Lina Silent" }),
    ]);
    await recomputeGenericMatchesForProfile(seeker);
    const [withRita, withSara, withLina] = await Promise.all([matchBetween(seeker, ritaP), matchBetween(seeker, saraP), matchBetween(seeker, linaP)]);
    const say = (match: string, from: string, when: string) =>
      admin.from("generic_messages").insert({ match_id: match, sender_id: from, body: "Hello", created_at: when });
    await say(withRita, parent.id, daysAgo(3));
    await say(withRita, rita.id, daysAgo(3));
    await say(withSara, parent.id, daysAgo(0.5));
    await say(withSara, sara.id, daysAgo(0.5));
    await say(withLina, parent.id, daysAgo(4)); // never answered

    expect((await pendingRatings(parent.id, "en")).map((p) => p.name)).toEqual(["Rita Talked"]);
    // The provider isn't asked to rate the customer here.
    expect(await pendingRatings(rita.id, "en")).toEqual([]);

    await admin.from("generic_ratings").insert({ match_id: withRita, rater_user_id: parent.id, ratee_user_id: rita.id, score: 5 });
    expect(await pendingRatings(parent.id, "en")).toEqual([]);
  });
});
