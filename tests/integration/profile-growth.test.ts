import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { profileActivity, profileViewCounts, recordProfileView } from "@/lib/profile-growth";
import { decoratePosts, POST_FEED_COLUMNS } from "@/lib/posts";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";

// Phase 3 of profiles: views are a count only, activity figures are
// server-only, and shared work never shows to someone who couldn't see it.

afterAll(cleanupUsers);

describe("profile views", () => {
  it("counts each viewer once a day, and no client can read who", async () => {
    const [owner, a, b] = await Promise.all([createUser("views-owner"), createUser("views-a"), createUser("views-b")]);
    const profile = await createProfile(owner, "nanny", "provider", NANNY_PROVIDER);

    await recordProfileView(profile, a.id);
    await recordProfileView(profile, a.id);
    await recordProfileView(profile, b.id);
    expect((await profileViewCounts([profile])).get(profile)).toBe(2);

    for (const client of [owner.client, a.client]) {
      const { data } = await client.from("profile_views").select("*").eq("profile_id", profile);
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("activity stats", () => {
  let parent: TestUser;
  let nanny: TestUser;
  let nannyProfile: string;
  let matchId: string;

  beforeAll(async () => {
    [parent, nanny] = await Promise.all([createUser("stats-parent"), createUser("stats-nanny")]);
    const parentProfile = await createProfile(parent, "nanny", "seeker", NANNY_SEEKER);
    nannyProfile = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(nannyProfile);
    matchId = await matchBetween(parentProfile, nannyProfile);
  });

  it("stays hidden below the threshold, and only the server can ask", async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    await admin.from("generic_messages").insert([
      { match_id: matchId, sender_id: parent.id, body: "Hi", created_at: minutesAgo(50) },
      { match_id: matchId, sender_id: nanny.id, body: "Hello!", created_at: minutesAgo(40) },
    ]);
    // One conversation, one reply: not enough to say anything yet.
    expect(await profileActivity(nannyProfile)).toEqual({ talkedWith: null, replySpeed: null });

    const { error } = await nanny.client.rpc("profile_activity_stats", { p_profile_id: nannyProfile });
    expect(error).not.toBeNull();
  });

  it("measures replies to the other side only", async () => {
    const { data } = await admin.rpc("profile_activity_stats", { p_profile_id: nannyProfile });
    expect(Number(data![0].conversations)).toBe(1);
    expect(Number(data![0].replies)).toBe(1);
    expect(Math.round(Number(data![0].median_reply_minutes))).toBe(10);
  });
});

describe("work shared to the feed", () => {
  let owner: TestUser;
  let other: TestUser;
  let projectId: string;
  let profileId: string;

  beforeAll(async () => {
    [owner, other] = await Promise.all([createUser("share-owner"), createUser("share-other")]);
    profileId = await createProfile(owner, "nanny", "provider", NANNY_PROVIDER);
    const { data } = await admin
      .from("work_projects")
      .insert({ profile_id: profileId, user_id: owner.id, title: "Garden" })
      .select("id")
      .single();
    projectId = data!.id;
    await admin.from("work_photos").insert({ project_id: projectId, user_id: owner.id, path: `${owner.id}/work-x.jpg`, url: "http://127.0.0.1:54321/x.jpg" });
  });

  it("can't point at someone else's project", async () => {
    const { error } = await other.client
      .from("posts")
      .insert({ user_id: other.id, kind: "offering", caption: "Look", work_project_id: projectId });
    expect(error).not.toBeNull();
  });

  it("shows its photos only to viewers who can see the work", async () => {
    const { data: post, error } = await owner.client
      .from("posts")
      .insert({ user_id: owner.id, kind: "offering", caption: "Garden", posted_as_generic_profile_id: profileId, work_project_id: projectId })
      .select(POST_FEED_COLUMNS)
      .single();
    expect(error).toBeNull();

    const [seen] = await decoratePosts([post!], other.id, other.client);
    expect(seen.work?.photoCount).toBe(1);

    // Paused profile: the post stays, the work photos don't show.
    await admin.from("generic_profiles").update({ status: "paused" }).eq("id", profileId);
    const [hidden] = await decoratePosts([post!], other.id, other.client);
    expect(hidden.work).toBeNull();
  });

  it("is removed with its project", async () => {
    await admin.from("work_projects").delete().eq("id", projectId);
    const { data } = await admin.from("posts").select("id").eq("work_project_id", projectId);
    expect(data).toEqual([]);
  });
});
