import { afterEach, describe, expect, it, vi } from "vitest";
import { quickestByRoad } from "@/lib/travel-time";

// The wave goes to the quickest by road among the nearest few, and falls
// back to straight-line order without a key or an answer from Google.

const pickup = { lat: 33.85, lon: 35.51 };
const riders = [
  { id: "near-but-over-the-mountain", point: { lat: 33.8, lon: 35.6 } },
  { id: "second", point: { lat: 33.86, lon: 35.52 } },
  { id: "third", point: { lat: 33.87, lon: 35.53 } },
];

describe("quickest by road", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps straight-line order without a server key", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    const { picked } = await quickestByRoad(riders, 2, pickup, 6);
    expect(picked.map((r) => r.id)).toEqual(["near-but-over-the-mountain", "second"]);
  });

  it("picks by travel time when Google answers", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { originIndex: 0, duration: "2400s", condition: "ROUTE_EXISTS" },
          { originIndex: 1, duration: "300s", condition: "ROUTE_EXISTS" },
          { originIndex: 2, duration: "600s", condition: "ROUTE_EXISTS" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { picked, minutes } = await quickestByRoad(riders, 2, pickup, 6);
    expect(picked.map((r) => r.id)).toEqual(["second", "third"]);
    expect(minutes.get(riders[0])).toBe(40);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
  });

  it("falls back when Google fails", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { picked } = await quickestByRoad(riders, 2, pickup, 6);
    expect(picked.map((r) => r.id)).toEqual(["near-but-over-the-mountain", "second"]);
  });

  it("doesn't ask Google once the day's cap is used up", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const book = vi.fn(async () => false);
    const { picked } = await quickestByRoad(riders, 2, pickup, 6, book);
    expect(book).toHaveBeenCalledWith(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(picked.map((r) => r.id)).toEqual(["near-but-over-the-mountain", "second"]);
  });

  it("doesn't ask when everyone fits in the wave", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await quickestByRoad(riders, 3, pickup, 6);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
