import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { browseProviders } from "@/lib/public-browse";
import { search, suggestNames } from "@/lib/search";
import { admin, cleanupUsers, createProfile, createUser, governorateId, NANNY_PROVIDER, NANNY_SEEKER } from "./helpers";

// search() reads the categories through the request's own client (cookies),
// which a test has no request for; the list itself is public.
vi.mock("@/lib/categories", async () => {
  const { admin: db } = await import("./helpers");
  return {
    getCategories: async () => (await db.from("categories").select("id, slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order")).data ?? [],
  };
});

// Looking without an account: providers only, from the server -- and the
// database itself no longer hands profiles or posts to a visitor.

afterAll(cleanupUsers);

describe("browsing without an account", () => {
  it("lists approved providers of a service, never seekers, hidden or suspended ones", async () => {
    const [pro, hidden, family, banned] = await Promise.all([
      createUser("browse-pro"),
      createUser("browse-hidden"),
      createUser("browse-family"),
      createUser("browse-banned"),
    ]);
    const shown = await createProfile(pro, "nanny", "provider", NANNY_PROVIDER, { fullName: "Browse Shown" });
    const off = await createProfile(hidden, "nanny", "provider", NANNY_PROVIDER, { fullName: "Browse Hidden" });
    await admin.from("generic_profiles").update({ public_page: false }).eq("id", off);
    const seeker = await createProfile(family, "nanny", "seeker", NANNY_SEEKER, { fullName: "Browse Family" });
    const suspended = await createProfile(banned, "nanny", "provider", NANNY_PROVIDER, { fullName: "Browse Banned" });
    await admin.from("users").update({ status: "suspended" }).eq("id", banned.id);

    const ids: string[] = [];
    for (let page = 0; ; page++) {
      const result = await browseProviders({ slug: "nanny", region: null, service: null, page });
      ids.push(...result!.cards.map((c) => c.id));
      if (!result!.more) break;
    }
    expect(ids).toContain(shown);
    for (const id of [off, seeker, suspended]) expect(ids).not.toContain(id);
  });

  it("narrows repairs to a trade", async () => {
    const [a, b] = await Promise.all([createUser("browse-plumber"), createUser("browse-painter")]);
    const plumber = await createProfile(a, "maintenance", "provider", { trades: ["plumber"] });
    const painter = await createProfile(b, "maintenance", "provider", { trades: ["painter"] });
    const result = await browseProviders({ slug: "maintenance", region: null, service: "plumber", page: 0 });
    const ids = result!.cards.map((c) => c.id);
    expect(ids).toContain(plumber);
    expect(ids).not.toContain(painter);
  });

  it("searches providers only for a visitor", async () => {
    const [pro, family] = await Promise.all([createUser("search-pro"), createUser("search-family")]);
    await createProfile(pro, "tutoring", "provider", {}, { fullName: "Zzvisitor Tutor" });
    await createProfile(family, "tutoring", "seeker", {}, { fullName: "Zzvisitor Family" });
    const results = await search("Zzvisitor", null, null, "en");
    expect(results.offering.map((p) => p.fullName)).toContain("Zzvisitor Tutor");
    expect(results.seeking).toEqual([]);
    expect(results.posts).toEqual([]);
  });

  it("finds a name anywhere in Lebanon, first, while other words stay in the area", async () => {
    const elsewhere = await governorateId();
    const { data: area } = await admin.from("locations").select("id").eq("level", "governorate").neq("id", elsewhere).limit(1).single();
    const [named, arabic, mention, far] = await Promise.all([createUser("name-far"), createUser("name-ar"), createUser("name-mention"), createUser("text-far")]);
    await createProfile(named, "tutoring", "provider", {}, { fullName: "Zzrana Khoury" });
    await createProfile(arabic, "tutoring", "provider", {}, { fullName: "زآية خوري" });
    const nearby = await createProfile(mention, "tutoring", "provider", { shortIntro: "Taught with Zzrana" }, { fullName: "Other Teacher" });
    await admin.from("generic_profiles").update({ location_id: area!.id }).eq("id", nearby);
    await createProfile(far, "tutoring", "provider", { shortIntro: "Zzfarword" }, { fullName: "Far Teacher" });

    expect((await search("zzrana", area!.id, null, "en")).offering.map((p) => p.fullName)).toEqual(["Zzrana Khoury", "Other Teacher"]);
    expect((await search("khoury zzrana", area!.id, null, "en")).offering.map((p) => p.fullName)).toEqual(["Zzrana Khoury"]);
    expect((await search("زاية", area!.id, null, "en")).offering.map((p) => p.fullName)).toEqual(["زآية خوري"]);
    expect((await search("Zzfarword", area!.id, null, "en")).offering).toEqual([]);
  });

  it("suggests people by name as it's typed: providers once each, only names, never seekers for a visitor", async () => {
    const [both, seeker, mention] = await Promise.all([createUser("suggest-both"), createUser("suggest-seeker"), createUser("suggest-mention")]);
    await createProfile(both, "tutoring", "provider", {}, { fullName: "Zzsuggest Haddad" });
    await createProfile(both, "nursing", "provider", {}, { fullName: "Zzsuggest Haddad" });
    await createProfile(seeker, "tutoring", "seeker", {}, { fullName: "Zzsuggest Seeker" });
    await createProfile(mention, "tutoring", "provider", { shortIntro: "Works with Zzsuggest" }, { fullName: "Other Name" });
    // Profiles made here skip the save that writes their search text; a full search fills it in.
    await search("zzsuggest", null, null, "en");

    expect((await suggestNames("zzsugg", null, "en")).map((p) => p.fullName)).toEqual(["Zzsuggest Haddad"]);
    expect((await suggestNames("haddad zzsuggest", null, "en")).map((p) => p.fullName)).toEqual(["Zzsuggest Haddad"]);
    expect(await suggestNames("z", null, "en")).toEqual([]);
  });

  it("gives a visitor's own database access no profiles or posts", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const table of ["generic_profiles", "posts", "post_replies"] as const) {
      const { data } = await anon.from(table).select("id").limit(5);
      expect(data ?? []).toEqual([]);
    }
  });
});
