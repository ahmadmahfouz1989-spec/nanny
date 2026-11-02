import { describe, expect, it } from "vitest";
import { matchesSearch, searchAlternatives, searchWords } from "@/lib/profile-search";

describe("search synonyms", () => {
  it("maps everyday Arabic trade words to the stored label", () => {
    for (const typed of ["كهربائي", "كهربا", "كهرباء"]) expect(searchAlternatives(searchWords(typed)[0])).toContain("electrician");
    expect(searchAlternatives(searchWords("سنكري")[0])).toContain("plumber");
    expect(searchAlternatives(searchWords("سبّاك")[0])).toContain("plumber");
    expect(searchAlternatives(searchWords("نجّار")[0])).toContain("carpenter");
  });

  it("treats ة and ه, أ and ا alike", () => {
    expect(searchAlternatives(searchWords("مربية")[0])).toContain("nanny");
    expect(searchAlternatives(searchWords("أستاذ")[0])).toContain("tutor");
  });

  it("leaves other words alone", () => {
    expect(searchAlternatives("hamra")).toEqual(["hamra"]);
  });

  it("finds an electrician profile from كهربائي", () => {
    const profile = { full_name: "Rabih", attributes: { trades: ["electrician"] }, locations: null };
    expect(matchesSearch(profile, "كهربائي")).toBe(true);
    expect(matchesSearch(profile, "سنكري")).toBe(false);
  });
});
