import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserAccount } from "@/lib/account-deletion";
import { loadProfilePage } from "@/lib/profile-page";
import { WORK_BUCKET, workPhotoPath } from "@/lib/work";
import { admin, cleanupUsers, createProfile, createUser, NANNY_PROVIDER, type TestUser } from "./helpers";

// Work projects: live without review, but only on profiles the viewer
// can see, and never writable straight from a client.

afterAll(cleanupUsers);

async function addProject(user: TestUser, profileId: string) {
  const { data, error } = await admin
    .from("work_projects")
    .insert({ profile_id: profileId, user_id: user.id, title: "Garden" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await admin.from("work_photos").insert({
    project_id: data.id,
    user_id: user.id,
    path: workPhotoPath(user.id, data.id, "jpg"),
    url: "http://127.0.0.1:54321/storage/v1/object/public/generic-photos/x.jpg",
  });
  return data.id;
}

describe("work projects", () => {
  let owner: TestUser;
  let viewer: TestUser;
  let liveProfile: string;
  let pendingProfile: string;

  beforeAll(async () => {
    [owner, viewer] = await Promise.all([createUser("worker"), createUser("viewer")]);
    liveProfile = await createProfile(owner, "nanny", "provider", NANNY_PROVIDER);
    pendingProfile = await createProfile(owner, "tutoring", "provider", {}, { approved: false });
  });

  it("is visible to others straight away, photos included", async () => {
    const id = await addProject(owner, liveProfile);
    expect((await viewer.client.from("work_projects").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await viewer.client.from("work_photos").select("id").eq("project_id", id)).data).toHaveLength(1);
  });

  it("stays hidden on a profile the viewer can't see", async () => {
    const id = await addProject(owner, pendingProfile);
    expect((await viewer.client.from("work_projects").select("id").eq("id", id)).data).toEqual([]);
  });

  it("can't be written straight from a client", async () => {
    const insert = await owner.client.from("work_projects").insert({ profile_id: liveProfile, user_id: owner.id, title: "Sneaky" });
    expect(insert.error).not.toBeNull();

    const id = await addProject(owner, liveProfile);
    await owner.client.from("work_projects").update({ title: "Changed" }).eq("id", id);
    await owner.client.from("work_projects").delete().eq("id", id);
    const { data } = await admin.from("work_projects").select("title").eq("id", id).single();
    expect(data!.title).toBe("Garden");
  });

  it("appears on the profile page for the owner and for others alike", async () => {
    const own = await loadProfilePage(owner.client, owner.id, liveProfile);
    const other = await loadProfilePage(viewer.client, viewer.id, liveProfile);
    expect(other!.work.length).toBeGreaterThan(0);
    expect(other!.work.map((p) => p.id)).toEqual(own!.work.map((p) => p.id));
  });

  it("has its files removed with the account", async () => {
    const leaver = await createUser("leaver");
    const path = workPhotoPath(leaver.id, "project", "jpg");
    const upload = await admin.storage.from(WORK_BUCKET).upload(path, new Blob(["x"], { type: "image/jpeg" }));
    expect(upload.error).toBeNull();

    expect(await deleteUserAccount(leaver.id)).toBeNull();
    const { data } = await admin.storage.from(WORK_BUCKET).list(leaver.id);
    expect(data ?? []).toEqual([]);
  });
});
