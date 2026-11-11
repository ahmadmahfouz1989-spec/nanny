import { afterAll, describe, expect, it } from "vitest";
import { browseProviders } from "@/lib/public-browse";
import { admin, cleanupUsers, createProfile, createUser } from "./helpers";

afterAll(cleanupUsers);

async function all(filters: Parameters<typeof browseProviders>[0]) {
  const names: string[] = [];
  let total = 0;
  for (let page = 0; ; page++) {
    const r = (await browseProviders({ ...filters, page }))!;
    names.push(...r.cards.map((c) => c.fullName));
    total = r.total;
    if (!r.more) break;
  }
  return { names, total };
}

describe("browse filters and trust details", () => {
  it("narrows to ID checked, 5+ years and a language, counts what's shown, and carries the details", async () => {
    const { data: langs } = await admin.from("languages").select("id, code");
    const french = langs!.find((l) => l.code === "fr")!.id;
    const [a, b, c] = await Promise.all([createUser("bf-a"), createUser("bf-b"), createUser("bf-c")]);
    const pa = await createProfile(a, "tutoring", "provider", { yearsExperience: 8, languageIds: [french] }, { fullName: "Zzbf Checked" });
    await createProfile(b, "tutoring", "provider", { yearsExperience: 2 }, { fullName: "Zzbf Junior" });
    await createProfile(c, "tutoring", "provider", { yearsExperience: 12 }, { fullName: "Zzbf Senior" });
    await admin.from("generic_profiles").update({ public_page: true }).in("user_id", [a.id, b.id, c.id]);
    const { error: idError } = await admin.from("id_documents").insert({ profile_id: pa, path: `${a.id}/id.png`, status: "approved" });
    expect(idError).toBeNull();

    const base = { slug: "tutoring", region: null, service: null, page: 0 };
    const mine = (names: string[]) => names.filter((n) => n.startsWith("Zzbf")).sort();
    expect(mine((await all(base)).names)).toEqual(["Zzbf Checked", "Zzbf Junior", "Zzbf Senior"]);
    expect(mine((await all({ ...base, idChecked: true })).names)).toEqual(["Zzbf Checked"]);
    expect(mine((await all({ ...base, minYears: 5 })).names)).toEqual(["Zzbf Checked", "Zzbf Senior"]);
    expect(mine((await all({ ...base, language: "fr" })).names)).toEqual(["Zzbf Checked"]);
    const withAll = await all(base);
    expect(withAll.total).toBe(withAll.names.length);

    const card = (await browseProviders({ ...base, idChecked: true }))!.cards.find((x) => x.fullName === "Zzbf Checked")!;
    expect(card).toMatchObject({ idChecked: true, years: 8, languages: ["fr"] });
    expect(Date.parse(card.joinedAt)).toBeGreaterThan(0);
  });
});
