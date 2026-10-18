import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserAccount } from "@/lib/account-deletion";
import { loadProfilePage } from "@/lib/profile-page";
import { WORK_BUCKET, sendBackToReview, workPhotoPath } from "@/lib/work";
import { admin, cleanupUsers, createProfile, createUser, NANNY_PROVIDER, type TestUser } from "./helpers";

// Work projects: hidden until approved, only on profiles the viewer can
// see, and never writable straight from a client.

afterAll(cleanupUsers);

async function addProject(user: TestUser, profileId: string, status: "pending" | "approved" = "pending") {
  const { data, error } = await admin
    .from("work_projects")
    .insert({ profile_id: profileId, user_id: user.id, title: "Garden", status })
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

  it("is visible to others only once approved", async () => {
    const id = await addProject(owner, liveProfile);
    expect((await owner.client.from("work_projects").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await viewer.client.from("work_projects").select("id").eq("id", id)).data).toEqual([]);
    expect((await viewer.client.from("work_photos").select("id").eq("project_id", id)).data).toEqual([]);

    await admin.from("work_projects").update({ status: "approved" }).eq("id", id);
    expect((await viewer.client.from("work_projects").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await viewer.client.from("work_photos").select("id").eq("project_id", id)).data).toHaveLength(1);
  });

  it("stays hidden on a profile the viewer can't see, even when approved", async () => {
    const id = await addProject(owner, pendingProfile, "approved");
    expect((await viewer.client.from("work_projects").select("id").eq("id", id)).data).toEqual([]);
  });

  it("can't be written straight from a client", async () => {
    const insert = await owner.client
      .from("work_projects")
      .insert({ profile_id: liveProfile, user_id: owner.id, title: "Sneaky", status: "approved" });
    expect(insert.error).not.toBeNull();

    const id = await addProject(owner, liveProfile);
    await owner.client.from("work_projects").update({ status: "approved" }).eq("id", id);
    const { data } = await admin.from("work_projects").select("status").eq("id", id).single();
    expect(data!.status).toBe("pending");
  });

  it("goes back to review when an approved project changes", async () => {
    const id = await addProject(owner, liveProfile, "approved");
    await sendBackToReview(admin, { id, status: "approved", title: "Garden" });
    const { data } = await admin.from("work_projects").select("status").eq("id", id).single();
    expect(data!.status).toBe("pending");
  });

  it("appears on the profile page: everything for the owner, approved work for others", async () => {
    const own = await loadProfilePage(owner.client, owner.id, liveProfile);
    const other = await loadProfilePage(viewer.client, viewer.id, liveProfile);
    expect(own!.work.some((p) => p.status === "pending")).toBe(true);
    expect(other!.work.length).toBeGreaterThan(0);
    expect(other!.work.every((p) => p.status === "approved")).toBe(true);
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
