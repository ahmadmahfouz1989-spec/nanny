import { describe, expect, it } from "vitest";
import { carryOver, type EarlierProfile } from "@/lib/profile-carryover";

const tutor: EarlierProfile = {
  role: "provider",
  location_id: "gov-beirut",
  profile_photo_url: "https://x/me.jpg",
  attributes: { districtId: "beirut", areaId: "hamra", locationDetail: "Near AUB", nationality: "lebanese", gender: "female", languageIds: ["ar", "en"], coverDistrictIds: ["baabda"], subjects: ["math"], yearsExperience: 7, shortIntro: "I teach math", rate: { unit: "per_hour" } },
};
const customer: EarlierProfile = {
  role: "seeker",
  location_id: "gov-mount",
  profile_photo_url: null,
  attributes: { districtId: "baabda", nationality: "filipino", languageIds: ["fr"], jobDescription: "A nurse" },
};

describe("starting a second profile", () => {
  it("a new provider profile starts with who they are, not what the other service was", () => {
    const { attributes, location_id, profile_photo_url } = carryOver([tutor], "provider");
    expect(location_id).toBe("gov-beirut");
    expect(profile_photo_url).toBe("https://x/me.jpg");
    expect(attributes).toEqual({ districtId: "beirut", areaId: "hamra", locationDetail: "Near AUB", nationality: "lebanese", gender: "female", languageIds: ["ar", "en"], coverDistrictIds: ["baabda"] });
  });

  it("a request takes only the place: a provider's languages and photo aren't its preferences", () => {
    expect(carryOver([tutor], "seeker")).toEqual({ location_id: "gov-beirut", profile_photo_url: null, attributes: { districtId: "beirut", areaId: "hamra", locationDetail: "Near AUB" } });
  });

  it("a request's preferences never become a provider's own details", () => {
    const { attributes } = carryOver([customer], "provider");
    expect(attributes).toEqual({ districtId: "baabda" });
  });

  it("a provider's own place wins over a more recent request's", () => {
    const { location_id, attributes } = carryOver([customer, tutor], "provider");
    expect(location_id).toBe("gov-beirut");
    expect((attributes as Record<string, unknown>).districtId).toBe("beirut");
    expect((attributes as Record<string, unknown>).nationality).toBe("lebanese");
  });

  it("the place comes from one profile, never a mix", () => {
    const partial: EarlierProfile = { role: "provider", location_id: "gov-south", profile_photo_url: null, attributes: { districtId: "saida" } };
    const { attributes } = carryOver([partial, tutor], "provider");
    expect((attributes as Record<string, unknown>).districtId).toBe("saida");
    expect((attributes as Record<string, unknown>).areaId).toBeUndefined();
  });

  it("fills what it can from older provider profiles", () => {
    const newest: EarlierProfile = { role: "provider", location_id: "gov-south", profile_photo_url: null, attributes: { districtId: "saida", languageIds: [] } };
    const result = carryOver([newest, tutor], "provider");
    expect(result.profile_photo_url).toBe("https://x/me.jpg");
    expect((result.attributes as Record<string, unknown>).languageIds).toEqual(["ar", "en"]);
  });

  it("someone new starts empty", () => {
    expect(carryOver([], "provider")).toEqual({ location_id: null, profile_photo_url: null, attributes: {} });
  });
});
