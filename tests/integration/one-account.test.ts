import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, categoryId, cleanupUsers, createUser, type TestUser } from "./helpers";

// One account, one identity: the name lives on the account and every
// profile keeps a copy; a verified phone added later reaches users.

async function makeProfile(user: TestUser, slug: string, role: "seeker" | "provider", fullName: string, status = "active") {
  const { data, error } = await admin
    .from("generic_profiles")
    .insert({ user_id: user.id, category_id: await categoryId(slug), role, full_name: fullName, status, moderation_status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

const accountName = async (id: string) => (await admin.from("users").select("full_name").eq("id", id).single()).data!.full_name;
const profile = async (id: string) => (await admin.from("generic_profiles").select("full_name, moderation_status").eq("id", id).single()).data!;
const approve = (id: string) => admin.from("generic_profiles").update({ moderation_status: "approved" }).eq("id", id);
const digits8 = () => String(Math.floor(10000000 + Math.random() * 89999999));

describe("one account, one identity", () => {
  afterAll(cleanupUsers);

  describe("the name", () => {
    let user: TestUser;
    let tutoring: string;
    let nursing: string;
    beforeAll(async () => {
      user = await createUser("identity");
      tutoring = await makeProfile(user, "tutoring", "provider", "Maya Saade");
      nursing = await makeProfile(user, "nursing", "seeker", "Maya Saade");
      await approve(tutoring);
      await approve(nursing);
    });

    it("a first profile names the account", async () => {
      expect(await accountName(user.id)).toBe("Maya Saade");
    });

    it("approving, pausing and switching on don't change it", async () => {
      await admin.from("generic_profiles").update({ status: "paused" }).eq("id", tutoring);
      await admin.from("generic_profiles").update({ status: "active" }).eq("id", tutoring);
      expect(await accountName(user.id)).toBe("Maya Saade");
      expect((await profile(tutoring)).moderation_status).toBe("approved");
    });

    it("a new account name reaches every profile and sends it back for review", async () => {
      await admin.from("users").update({ full_name: "Maya S. Saade" }).eq("id", user.id);
      for (const id of [tutoring, nursing]) {
        expect(await profile(id)).toEqual({ full_name: "Maya S. Saade", moderation_status: "pending" });
      }
    });

    it("a name saved on one profile reaches the account and the others", async () => {
      await approve(nursing);
      await admin.from("generic_profiles").update({ full_name: "Maya Haddad" }).eq("id", tutoring);
      expect(await accountName(user.id)).toBe("Maya Haddad");
      expect(await profile(nursing)).toEqual({ full_name: "Maya Haddad", moderation_status: "pending" });
    });

    it("the owner can rename their account, but not with an empty name", async () => {
      expect((await user.client.from("users").update({ full_name: "Maya Khoury" }).eq("id", user.id)).error).toBeNull();
      expect((await profile(nursing)).full_name).toBe("Maya Khoury");
      expect((await user.client.from("users").update({ full_name: "M" }).eq("id", user.id)).error).not.toBeNull();
      expect(await accountName(user.id)).toBe("Maya Khoury");
    });

    it("a draft takes the name but stays out of review, and doesn't name the account", async () => {
      const other = await createUser("identity-draft");
      await makeProfile(other, "tutoring", "provider", "Draft profile", "draft");
      expect(await accountName(other.id)).toBeNull();
      const draft = await makeProfile(user, "maintenance", "provider", "Draft profile", "draft");
      await admin.from("users").update({ full_name: "Maya Daher" }).eq("id", user.id);
      expect((await profile(draft)).full_name).toBe("Maya Daher");
      await admin.from("generic_profiles").update({ moderation_status: "approved" }).eq("id", draft);
      await admin.from("users").update({ full_name: "Maya Nassar" }).eq("id", user.id);
      expect((await profile(draft)).moderation_status).toBe("approved");
    });
  });

  describe("email and phone", () => {
    it("a verified phone added later reaches users", async () => {
      const user = await createUser("identity-phone");
      const phone = `9613${digits8()}`;
      const { error } = await admin.auth.admin.updateUserById(user.id, { phone, phone_confirm: true });
      expect(error).toBeNull();
      const { data } = await admin.from("users").select("phone, phone_verified_at, email").eq("id", user.id).single();
      expect(data!.phone).toBe(phone);
      expect(data!.phone_verified_at).not.toBeNull();
      expect(data!.email).toBe(user.email);
    });

    it("a number already on another account is refused", async () => {
      const first = await createUser("identity-first");
      const second = await createUser("identity-second");
      const phone = `9613${digits8()}`;
      await admin.auth.admin.updateUserById(first.id, { phone, phone_confirm: true });
      const { error } = await admin.auth.admin.updateUserById(second.id, { phone, phone_confirm: true });
      expect(error).not.toBeNull();
      expect((await admin.from("users").select("phone").eq("id", second.id).single()).data!.phone).toBeNull();
    });

    it("an unconfirmed phone doesn't reach users", async () => {
      const user = await createUser("identity-unconfirmed");
      await admin.auth.admin.updateUserById(user.id, { phone: `9613${digits8()}`, phone_confirm: false });
      expect((await admin.from("users").select("phone, phone_verified_at").eq("id", user.id).single()).data).toEqual({ phone: null, phone_verified_at: null });
    });

    it("a verified email change reaches users", async () => {
      const user = await createUser("identity-email");
      const email = `new-${digits8()}@test.local`;
      await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
      expect((await admin.from("users").select("email").eq("id", user.id).single()).data!.email).toBe(email);
    });

    it("the owner still can't write their own phone, email or verification", async () => {
      const user = await createUser("identity-guard");
      for (const change of [{ phone: "96170000000" }, { email: "x@test.local" }, { phone_verified_at: new Date().toISOString() }]) {
        expect((await user.client.from("users").update(change).eq("id", user.id)).error).not.toBeNull();
      }
    });

    it("WhatsApp sign-up keeps its first-time flag", async () => {
      const phone = `9613${digits8()}`;
      const { data } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
      const { data: row } = await admin.from("users").select("phone, phone_verified_at").eq("id", data.user!.id).single();
      expect(row).toEqual({ phone, phone_verified_at: null });
      await admin.auth.admin.deleteUser(data.user!.id);
    });
  });
});
