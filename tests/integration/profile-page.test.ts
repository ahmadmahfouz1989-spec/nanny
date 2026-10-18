import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { loadProfilePage } from "@/lib/profile-page";
import { cleanupUsers, createProfile, createUser, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";

// The profile page (/u/[id]) shows only what the viewer could already see
// on a card, and never the owner's account id.

afterAll(cleanupUsers);

describe("profile page", () => {
  let owner: TestUser;
  let parent: TestUser;
  let stranger: TestUser;
  let nannyId: string;
  let tutoringId: string;

  beforeAll(async () => {
    [owner, parent, stranger] = await Promise.all([createUser("owner"), createUser("parent"), createUser("stranger")]);
    nannyId = await createProfile(owner, "nanny", "provider", { ...NANNY_PROVIDER, shortIntro: "Hi" });
    tutoringId = await createProfile(owner, "tutoring", "provider", {}, { approved: false });
    await createProfile(parent, "nanny", "seeker", NANNY_SEEKER);
    await recomputeGenericMatchesForProfile(nannyId);
  });

  it("shows a matched viewer the profile, the match and only the live tabs", async () => {
    const page = await loadProfilePage(parent.client, parent.id, nannyId);
    expect(page).not.toBeNull();
    expect(page!.isOwn).toBe(false);
    expect(page!.profile.attributes.shortIntro).toBe("Hi");
    expect(page!.tabs.map((t) => t.id)).toEqual([nannyId]);
    expect(page!.match?.viewerSide).toBe("seeker");
    expect(page!.viewerCanMatch).toBe(true);
    expect(JSON.stringify(page)).not.toContain(owner.id);
  });

  it("hides a profile in review from everyone but its owner", async () => {
    expect(await loadProfilePage(parent.client, parent.id, tutoringId)).toBeNull();
    const own = await loadProfilePage(owner.client, owner.id, tutoringId);
    expect(own?.isOwn).toBe(true);
    expect(own?.tabs.map((t) => t.id).sort()).toEqual([nannyId, tutoringId].sort());
  });

  it("tells a viewer with no profile in the category that they can't match", async () => {
    const page = await loadProfilePage(stranger.client, stranger.id, nannyId);
    expect(page?.match).toBeNull();
    expect(page?.viewerCanMatch).toBe(false);
  });
});
