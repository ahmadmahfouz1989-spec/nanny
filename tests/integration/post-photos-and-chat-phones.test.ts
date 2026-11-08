import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

const PUBLIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-photos`;

describe("photos on posts", () => {
  let poster: TestUser, other: TestUser, as: string;
  beforeAll(async () => {
    [poster, other] = await Promise.all([createUser("photo-poster"), createUser("photo-other")]);
    as = await createProfile(poster, "nanny", "provider", NANNY_PROVIDER);
  });
  afterAll(cleanupUsers);

  it("a post can show its author's own photos", async () => {
    const { error } = await poster.client
      .from("posts")
      .insert({ user_id: poster.id, posted_as_generic_profile_id: as, kind: "offering", caption: "Fresh paint job in Hamra", photo_urls: [`${PUBLIC}/${poster.id}/a.jpg`] });
    expect(error).toBeNull();
  });

  it("but not someone else's, nor an outside link", async () => {
    const theirs = await poster.client.from("posts").insert({ user_id: poster.id, posted_as_generic_profile_id: as, kind: "offering", caption: "x x x", photo_urls: [`${PUBLIC}/${other.id}/a.jpg`] });
    expect(theirs.error).not.toBeNull();
    const outside = await poster.client.from("posts").insert({ user_id: poster.id, posted_as_generic_profile_id: as, kind: "offering", caption: "x x x", photo_urls: ["https://example.com/a.jpg"] });
    expect(outside.error).not.toBeNull();
  });

  it("at most four", async () => {
    const five = [1, 2, 3, 4, 5].map((n) => `${PUBLIC}/${poster.id}/${n}.jpg`);
    const { error } = await poster.client.from("posts").insert({ user_id: poster.id, posted_as_generic_profile_id: as, kind: "offering", caption: "x x x", photo_urls: five });
    expect(error).not.toBeNull();
  });
});

describe("phone numbers in chat (database backstop)", () => {
  let family: TestUser, nanny: TestUser, matchId: string;
  beforeAll(async () => {
    [family, nanny] = await Promise.all([createUser("phone-family"), createUser("phone-nanny")]);
    const seeker = await createProfile(family, "nanny", "seeker", NANNY_SEEKER);
    const provider = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(seeker);
    matchId = await matchBetween(seeker, provider);
  });
  afterAll(cleanupUsers);

  it("refuses a number written straight to the table", async () => {
    const { error } = await family.client.from("generic_messages").insert({ match_id: matchId, sender_id: family.id, body: "call me 03 123 456" });
    expect(error?.message).toContain("phone_number");
  });

  it("lets ordinary messages through, prices and times included", async () => {
    const { error } = await family.client
      .from("generic_messages")
      .insert({ match_id: matchId, sender_id: family.id, body: "Mondays 8:30 to 5, budget 3,500,000 LBP a month, 2 kids" });
    expect(error).toBeNull();
  });
});
