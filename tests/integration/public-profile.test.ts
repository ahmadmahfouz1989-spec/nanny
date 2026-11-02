import { afterAll, describe, expect, it } from "vitest";
import { loadPublicProfile } from "@/lib/public-profile";
import { admin, cleanupUsers, createProfile, createUser } from "./helpers";

// A provider's shareable page: who may have one, and that it never
// carries private details.

afterAll(cleanupUsers);

describe("public profile page", () => {
  it("shows an approved provider without private details", async () => {
    const pro = await createUser("public-pro");
    const id = await createProfile(pro, "maintenance", "provider", {
      trades: ["electrician"],
      shortIntro: "Electrical repairs",
      nationality: "lebanese",
      locationDetail: "Building 4, 2nd floor",
    });
    await admin.from("users").update({ phone: "+96171000000" }).eq("id", pro.id);
    const page = await loadPublicProfile(id);
    expect(page).toMatchObject({ id, intro: "Electrical repairs", trades: ["electrician"] });
    const text = JSON.stringify(page);
    for (const secret of ["+96171000000", pro.email, pro.id, "Building 4", "lebanese"]) expect(text).not.toContain(secret);
  });

  it("is off for seekers, unapproved profiles, switched-off pages and suspended accounts", async () => {
    const user = await createUser("public-none");
    const seeker = await createProfile(user, "nanny", "seeker", {});
    const pending = await createProfile(user, "tutoring", "provider", {}, { approved: false });
    const off = await createProfile(user, "nursing", "provider", {});
    await admin.from("generic_profiles").update({ public_page: false }).eq("id", off);
    expect(await loadPublicProfile(seeker)).toBeNull();
    expect(await loadPublicProfile(pending)).toBeNull();
    expect(await loadPublicProfile(off)).toBeNull();

    const suspended = await createUser("public-suspended");
    const theirs = await createProfile(suspended, "maintenance", "provider", { trades: ["plumber"] });
    await admin.from("users").update({ status: "suspended" }).eq("id", suspended.id);
    expect(await loadPublicProfile(theirs)).toBeNull();
    expect(await loadPublicProfile("not-a-uuid")).toBeNull();
  });
});
