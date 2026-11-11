import { afterAll, describe, expect, it, vi } from "vitest";
import { browseProviders } from "@/lib/public-browse";
import { search, suggestNames } from "@/lib/search";
import { admin, cleanupUsers, createProfile, createUser } from "./helpers";

vi.mock("@/lib/categories", async () => {
  const { admin: db } = await import("./helpers");
  return {
    getCategories: async () => (await db.from("categories").select("id, slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order")).data ?? [],
  };
});

afterAll(cleanupUsers);

// The App Store reviewer's demo account works for itself but is never
// listed for anyone else.
describe("the reviewer's demo account", () => {
  it("is left out of browse, search and name suggestions", async () => {
    const [demo, real] = await Promise.all([createUser("demo"), createUser("real")]);
    await admin.from("users").update({ email: "appreview@oui-know.com" }).eq("id", demo.id);
    await createProfile(demo, "tutoring", "provider", {}, { fullName: "Zzhidden Demo" });
    await createProfile(real, "tutoring", "provider", {}, { fullName: "Zzhidden Real" });
    await admin.from("generic_profiles").update({ public_page: true }).in("user_id", [demo.id, real.id]);

    const names = (await search("zzhidden", null, null, "en")).offering.map((p) => p.fullName);
    expect(names).toEqual(["Zzhidden Real"]);
    expect((await suggestNames("zzhidden", null, "en")).map((p) => p.fullName)).toEqual(["Zzhidden Real"]);
    const browse: string[] = [];
    for (let page = 0; ; page++) {
      const result = (await browseProviders({ slug: "tutoring", region: null, service: null, page }))!;
      browse.push(...result.cards.map((c) => c.fullName));
      if (!result.more) break;
    }
    expect(browse).toContain("Zzhidden Real");
    expect(browse).not.toContain("Zzhidden Demo");
  });
});
