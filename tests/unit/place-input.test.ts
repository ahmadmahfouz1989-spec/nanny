import { describe, expect, it } from "vitest";
import { cleanAddress, isGoogleHost, lebanonPoint, parseCoordinates, parseMapsLink, straightLineKm } from "@/lib/place-input";

const near = (p: { lat: number; lng: number } | null, lat: number, lng: number) => {
  expect(p).not.toBeNull();
  expect(p!.lat).toBeCloseTo(lat, 4);
  expect(p!.lng).toBeCloseTo(lng, 4);
};

describe("parseCoordinates", () => {
  it("reads degrees, minutes and seconds", () => {
    near(parseCoordinates(`33°47'32.8"N 35°30'31.3"E`), 33.792444, 35.508694);
    near(parseCoordinates(`33° 47' 32.8" N, 35° 30' 31.3" E`), 33.792444, 35.508694);
    near(parseCoordinates("33°47′32.8″N 35°30′31.3″E"), 33.792444, 35.508694);
    near(parseCoordinates(`N33°47'32.8" E35°30'31.3"`), 33.792444, 35.508694);
  });

  it("reads degrees and minutes, and hemispheres in either order", () => {
    near(parseCoordinates("33°47.5'N 35°30.5'E"), 33.791667, 35.508333);
    near(parseCoordinates(`35°30'31.3"E 33°47'32.8"N`), 33.792444, 35.508694);
    near(parseCoordinates(`33°47'32.8"S 35°30'31.3"W`), -33.792444, -35.508694);
  });

  it("reads decimals", () => {
    expect(parseCoordinates("33.7924, 35.5087")).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(parseCoordinates("33.7924 35.5087")).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(parseCoordinates("33.7924N 35.5087E")).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(parseCoordinates("(33.7924, 35.5087)")).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(parseCoordinates("33,7924 35,5087")).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(parseCoordinates("-33.79, -35.5")).toEqual({ lat: -33.79, lng: -35.5 });
  });

  it("reads Arabic digits and punctuation", () => {
    expect(parseCoordinates("٣٣٫٧٩٢٤، ٣٥٫٥٠٨٧")).toEqual({ lat: 33.7924, lng: 35.5087 });
  });

  it("leaves ordinary searches alone", () => {
    for (const text of ["Hamra", "12 34", "Building 33, 35th street", "ABC Achrafieh", "", "33.79", "الحمرا"]) {
      expect(parseCoordinates(text), text).toBeNull();
    }
  });

  it("refuses what can't be on Earth", () => {
    expect(parseCoordinates("95.5, 35.5")).toBeNull();
    expect(parseCoordinates("33.5, 190.5")).toBeNull();
  });
});

describe("parseMapsLink", () => {
  it("prefers the place's own pin over where the map was looking", () => {
    const url = "https://www.google.com/maps/place/Pharmacy/@33.8,35.4,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d33.7924!4d35.5087!16s";
    expect(parseMapsLink(url)).toEqual({ kind: "point", point: { lat: 33.7924, lng: 35.5087 } });
  });

  it("reads the common link shapes", () => {
    const point = { kind: "point", point: { lat: 33.7924, lng: 35.5087 } };
    expect(parseMapsLink("https://www.google.com/maps/@33.7924,35.5087,15z")).toEqual(point);
    expect(parseMapsLink("https://www.google.com/maps?q=33.7924,35.5087")).toEqual(point);
    expect(parseMapsLink("https://maps.google.com/?q=33.7924,35.5087")).toEqual(point);
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=33.7924%2C35.5087")).toEqual(point);
    expect(parseMapsLink("https://www.google.com/maps/search/33.7924,+35.5087")).toEqual(point);
    expect(parseMapsLink("https://www.google.com.lb/maps/place/33.7924,35.5087")).toEqual(point);
    expect(parseMapsLink("google.com/maps/@33.7924,35.5087,15z")).toEqual(point);
    expect(parseMapsLink("Here you go: https://www.google.com/maps/@33.7924,35.5087,15z thanks")).toEqual(point);
  });

  it("sends short links to the server", () => {
    expect(parseMapsLink("https://maps.app.goo.gl/AbC123xyz")).toEqual({ kind: "short", url: "https://maps.app.goo.gl/AbC123xyz" });
    expect(parseMapsLink("Pharmacy Mazen https://maps.app.goo.gl/AbC123xyz?g_st=ic")).toEqual({ kind: "short", url: "https://maps.app.goo.gl/AbC123xyz?g_st=ic" });
    expect(parseMapsLink("maps.app.goo.gl/AbC123xyz")).toEqual({ kind: "short", url: "https://maps.app.goo.gl/AbC123xyz" });
  });

  it("falls back to the place's name", () => {
    expect(parseMapsLink("https://www.google.com/maps/place/Pharmacy+Mazen/")).toEqual({ kind: "query", text: "Pharmacy Mazen" });
    expect(parseMapsLink("https://maps.google.com/?q=Pharmacy+Mazen+Beirut")).toEqual({ kind: "query", text: "Pharmacy Mazen Beirut" });
  });

  it("ignores everything that isn't Google Maps", () => {
    for (const text of ["Hamra", "https://example.com/maps/@33.7,35.5,15z", "https://google.com.evil.example/maps/@33.7,35.5,15z", "https://www.google.com/search?q=33.7,35.5", "https://goo.gl/other"]) {
      expect(parseMapsLink(text), text).toBeNull();
    }
  });
});

describe("the rest", () => {
  it("only trusts Google's hosts", () => {
    expect(isGoogleHost("www.google.com")).toBe(true);
    expect(isGoogleHost("maps.google.com.lb")).toBe(true);
    expect(isGoogleHost("consent.google.com")).toBe(true);
    expect(isGoogleHost("maps.app.goo.gl")).toBe(true);
    expect(isGoogleHost("google.com.evil.example")).toBe(false);
    expect(isGoogleHost("notgoogle.com")).toBe(false);
    expect(isGoogleHost("169.254.169.254")).toBe(false);
    expect(isGoogleHost("localhost")).toBe(false);
  });

  it("keeps spots in Lebanon, turns swapped coordinates round, refuses the rest", () => {
    expect(lebanonPoint({ lat: 33.7924, lng: 35.5087 })).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(lebanonPoint({ lat: 35.5087, lng: 33.7924 })).toEqual({ lat: 33.7924, lng: 35.5087 });
    expect(lebanonPoint({ lat: 48.8584, lng: 2.2945 })).toBeNull();
    expect(lebanonPoint({ lat: -33.79, lng: -35.5 })).toBeNull();
  });

  it("spells Beirut the usual way", () => {
    expect(cleanAddress("Sassine Square, Bayrut, Lebanon")).toBe("Sassine Square, Beirut, Lebanon");
    expect(cleanAddress("ساحة ساسين، بيروت")).toBe("ساحة ساسين، بيروت");
  });

  it("measures distance", () => {
    expect(straightLineKm({ lat: 33.8966, lng: 35.4823 }, { lat: 33.8869, lng: 35.5203 })).toBeCloseTo(3.7, 0);
  });
});
