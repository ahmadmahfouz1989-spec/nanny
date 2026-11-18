import { afterAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser } from "./helpers";

// A team, company, salon or garage goes by its own name: saving it doesn't
// rename the person, and renaming the person doesn't rename the business.
describe("business names", () => {
  afterAll(cleanupUsers);
  const name = async (table: "users" | "generic_profiles", id: string) =>
    (await admin.from(table).select("full_name").eq("id", id).single()).data!.full_name;

  it("stay on the business, apart from the person's name", async () => {
    const owner = await createUser("garage-owner");
    const own = await createProfile(owner, "tutoring", "provider", {}, { fullName: "Karim Haddad" });
    const garage = await createProfile(owner, "car", "provider", { providerType: "garage" }, { fullName: "Haddad Garage" });

    expect(await name("users", owner.id)).toBe("Karim Haddad");
    expect(await name("generic_profiles", own)).toBe("Karim Haddad");

    await admin.from("users").update({ full_name: "Karim H. Haddad" }).eq("id", owner.id);
    expect(await name("generic_profiles", own)).toBe("Karim H. Haddad");
    expect(await name("generic_profiles", garage)).toBe("Haddad Garage");
  });
});
