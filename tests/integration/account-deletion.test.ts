import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { resolveMatchAccess } from "@/lib/matching/match-access";
import { applyInterest } from "@/lib/matching/apply-interest";
import { deleteUserAccount } from "@/lib/account-deletion";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, request, type TestUser } from "./helpers";

// Deleting an account must take everything of theirs -- including the
// other person's voice notes in their conversations and other users'
// notifications about them -- while leaving the other person's own data
// and any reports intact.

let leaving: TestUser;
let staying: TestUser;
let matchId: string;
let stayingPostId: string;
let leavingReplyId: string;
const stayingNote = () => `${staying.id}/to-leaving.webm`;
const stayingUnrelated = () => `${staying.id}/unrelated.webm`;

async function upload(path: string) {
  const { error } = await admin.storage.from("voice-notes").upload(path, new Blob(["audio"], { type: "audio/webm" }), {
    contentType: "audio/webm",
    upsert: true,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

async function exists(path: string) {
  const [folder, name] = path.split("/");
  const { data } = await admin.storage.from("voice-notes").list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
}

beforeAll(async () => {
  [leaving, staying] = await Promise.all([createUser("leaving"), createUser("staying")]);
  const leavingProfile = await createProfile(leaving, "nanny", "seeker", NANNY_SEEKER);
  const stayingProfile = await createProfile(staying, "nanny", "provider", NANNY_PROVIDER);
  await recomputeGenericMatchesForProfile(stayingProfile);
  matchId = await matchBetween(leavingProfile, stayingProfile);
  await applyInterest(request(), (await resolveMatchAccess(leaving.client, matchId, leaving.id))!);
  await applyInterest(request(), (await resolveMatchAccess(staying.client, matchId, staying.id))!);

  // A conversation with a voice note each way, plus an unrelated file.
  const leavingNote = `${leaving.id}/to-staying.webm`;
  await Promise.all([upload(leavingNote), upload(stayingNote()), upload(stayingUnrelated())]);
  await admin.from("generic_messages").insert([
    { match_id: matchId, sender_id: leaving.id, body: "🎤", audio_path: leavingNote },
    { match_id: matchId, sender_id: staying.id, body: "🎤", audio_path: stayingNote() },
  ]);

  // The staying user's post, which the leaving user replied to.
  const { data: post } = await admin.from("posts").insert({ user_id: staying.id, kind: "offering", caption: "Mornings free" }).select("id").single();
  stayingPostId = post!.id;
  const { data: reply } = await admin.from("post_replies").insert({ post_id: stayingPostId, user_id: leaving.id, body: "Interested" }).select("id").single();
  leavingReplyId = reply!.id;
  await admin.from("notifications").insert([
    { user_id: staying.id, type: "post_reply", payload: { post_id: stayingPostId, reply_id: leavingReplyId } },
    { user_id: staying.id, type: "post_like", payload: { post_id: stayingPostId } },
  ]);

  await admin.from("reports").insert({ reporter_user_id: leaving.id, reported_user_id: staying.id, reason: "other", details: "test" });

  expect(await deleteUserAccount(leaving.id)).toBeNull();
});

afterAll(cleanupUsers);

describe("deleting an account", () => {
  it("removes the account and everything of theirs", async () => {
    const { data: user } = await admin.from("users").select("id").eq("id", leaving.id);
    expect(user).toEqual([]);
    const { data: profiles } = await admin.from("generic_profiles").select("id").eq("user_id", leaving.id);
    expect(profiles).toEqual([]);
    const { data: match } = await admin.from("generic_matches").select("id").eq("id", matchId);
    expect(match).toEqual([]);
    const { data: messages } = await admin.from("generic_messages").select("id").eq("match_id", matchId);
    expect(messages).toEqual([]);
    const { data: reply } = await admin.from("post_replies").select("id").eq("id", leavingReplyId);
    expect(reply).toEqual([]);
  });

  it("removes the other person's voice notes from their conversation, and nothing else of theirs", async () => {
    expect(await exists(stayingNote())).toBe(false);
    expect(await exists(stayingUnrelated())).toBe(true);
  });

  it("clears other users' notifications about them", async () => {
    const { data } = await admin.from("notifications").select("type, payload").eq("user_id", staying.id);
    const types = (data ?? []).map((n) => n.type);
    expect(types).not.toContain("interest_accepted");
    expect(types).not.toContain("post_reply");
    // A like doesn't say who -- nothing to clean up there.
    expect(types).toContain("post_like");
  });

  it("keeps the other person's account, profile and post", async () => {
    const { data: profiles } = await admin.from("generic_profiles").select("id").eq("user_id", staying.id);
    expect(profiles).toHaveLength(1);
    const { data: post } = await admin.from("posts").select("id").eq("id", stayingPostId);
    expect(post).toHaveLength(1);
  });

  it("keeps reports, without the deleted person", async () => {
    const { data } = await admin.from("reports").select("reporter_user_id").eq("reported_user_id", staying.id);
    expect(data).toEqual([{ reporter_user_id: null }]);
  });
});
