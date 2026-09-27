import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { refreshSearchText } from "@/lib/search-text";
import { searchWords } from "@/lib/profile-search";
import { admin, cleanupUsers, createProfile, createUser, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";

// list_profile_matches: filters, search, order and paging in the database.
// One parent, four nannies with different fits, in a governorate no other
// local data uses, so only this test's profiles are listed.

let parent: TestUser;
let parentProfile: string;
const nannies: Record<string, string> = {};
let governorates: string[];

async function list(args: Partial<{ gov: string; day: string; minYears: number; q: string; matchId: string; limit: number; offset: number }> = {}) {
  const words = args.q ? searchWords(args.q) : [];
  const { data, error } = await parent.client.rpc("list_profile_matches", {
    p_profile_id: parentProfile,
    p_governorate_id: args.gov,
    p_day: args.day,
    p_min_years: args.minYears,
    p_words: words.length ? words : undefined,
    p_match_id: args.matchId,
    p_limit: args.limit ?? 20,
    p_offset: args.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

const name = (otherId: string) => Object.entries(nannies).find(([, id]) => id === otherId)?.[0];

beforeAll(async () => {
  const { data: govs } = await admin.from("locations").select("id").eq("level", "governorate").order("name_en").limit(2);
  governorates = (govs ?? []).map((g) => g.id);

  parent = await createUser("list-parent");
  parentProfile = await createProfile(parent, "nanny", "seeker", { ...NANNY_SEEKER, neededDays: ["mon"] });

  const specs: [string, Record<string, unknown>, string][] = [
    ["best", { ...NANNY_PROVIDER, yearsExperience: 6, certifications: ["first_aid_cpr"] }, governorates[0]!],
    ["weekend", { ...NANNY_PROVIDER, availability: { days: ["sat", "sun"] }, yearsExperience: 1 }, governorates[0]!],
    ["far", { ...NANNY_PROVIDER, yearsExperience: 3 }, governorates[1]!],
    ["pending", { ...NANNY_PROVIDER }, governorates[0]!],
  ];
  for (const [label, attributes, gov] of specs) {
    const user = await createUser(`list-${label}`);
    const id = await createProfile(user, "nanny", "provider", attributes as never, { approved: label !== "pending", fullName: `Nanny ${label}` });
    await admin.from("generic_profiles").update({ location_id: gov }).eq("id", id);
    nannies[label] = id;
  }
  await admin.from("generic_profiles").update({ location_id: governorates[0]! }).eq("id", parentProfile);
  for (const id of Object.values(nannies)) await recomputeGenericMatchesForProfile(id);
  await refreshSearchText(Object.values(nannies));
});

afterAll(cleanupUsers);

// Only this test's nannies (the local database may hold other profiles).
async function listed(args: Parameters<typeof list>[0] = {}) {
  return (await list(args)).map((r) => name(r.other_profile_id)).filter(Boolean);
}

describe("list_profile_matches", () => {
  it("lists visible counterparts best match first, never a profile in review", async () => {
    const names = await listed();
    expect(names).toContain("best");
    expect(names).not.toContain("pending");
    expect(names.indexOf("best")).toBeLessThan(names.indexOf("far"));
  });

  it("puts Featured profiles first", async () => {
    const { data } = await admin.from("generic_profiles").select("user_id").eq("id", nannies.far!).single();
    await admin.from("users").update({ featured_until: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", data!.user_id);
    const rows = await list();
    expect(rows[0]!.other_profile_id).toBe(nannies.far);
    expect(rows[0]!.featured).toBe(true);
    await admin.from("users").update({ featured_until: null }).eq("id", data!.user_id);
  });

  it("filters by area, day and experience", async () => {
    expect(await listed({ gov: governorates[1] })).toEqual(["far"]);
    expect(await listed({ day: "sat" })).toEqual(["weekend"]);
    expect((await listed({ minYears: 5 })).sort()).toEqual(["best"]);
  });

  it("searches the stored text, every word must match", async () => {
    expect(await listed({ q: "CPR" })).toEqual(["best"]);
    expect(await listed({ q: "إسعافات" })).toEqual(["best"]);
    expect(await listed({ q: "nanny weekend" })).toEqual(["weekend"]);
    expect(await listed({ q: "weekend cpr" })).toEqual([]);
  });

  it("pages, with the total of the whole filtered list", async () => {
    const all = await list({ gov: governorates[0] });
    const first = await list({ gov: governorates[0], limit: 1 });
    const second = await list({ gov: governorates[0], limit: 1, offset: 1 });
    expect(first).toHaveLength(1);
    expect(Number(first[0]!.total)).toBe(all.length);
    expect(second[0]!.match_id).toBe(all[1]!.match_id);
  });

  it("returns a notification's target regardless of filters", async () => {
    const target = (await list()).find((r) => r.other_profile_id === nannies.far)!;
    const rows = await list({ matchId: target.match_id, gov: governorates[0], q: "nothing matches this" });
    expect(rows.map((r) => r.match_id)).toEqual([target.match_id]);
  });

  it("lists nothing for a profile that isn't the caller's", async () => {
    const outsider = await createUser("list-outsider");
    const { data } = await outsider.client.rpc("list_profile_matches", { p_profile_id: parentProfile });
    expect(data).toEqual([]);
  });
});
