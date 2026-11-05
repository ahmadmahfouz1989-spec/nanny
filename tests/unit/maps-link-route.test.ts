import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const user = vi.hoisted(() => ({ current: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/session", () => ({ requireActiveUser: async () => user.current }));

const { GET } = await import("@/app/api/maps-link/route");
const call = (url: string) => GET(new Request(`http://localhost/api/maps-link?url=${encodeURIComponent(url)}`));
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

describe("/api/maps-link", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    user.current = { id: "u1" };
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("follows a short link to the place's coordinates", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://www.google.com/maps/place/Shop/@33.8,35.4,17z/data=!3d33.7924!4d35.5087"));
    const res = await call("https://maps.app.goo.gl/AbC123");
    expect(await res.json()).toEqual({ point: { lat: 33.7924, lng: 35.5087 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gets past Google's consent page", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://consent.google.com/m?continue=" + encodeURIComponent("https://www.google.com/maps/@33.7924,35.5087,15z")));
    expect(await (await call("https://maps.app.goo.gl/AbC123")).json()).toEqual({ point: { lat: 33.7924, lng: 35.5087 } });
  });

  it("never trusts the page's own map: it starts wherever the server seems to be", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://www.google.com/maps/place/American+University+of+Beirut"));
    fetchMock.mockResolvedValueOnce(new Response('<meta content="https://x/staticmap?center=45.50791835%2C-73.56416&zoom=11">', { status: 200 }));
    expect(await (await call("https://maps.app.goo.gl/AbC123")).json()).toEqual({ query: "American University of Beirut" });
  });

  it("falls back to the place's name", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://www.google.com/maps/place/Pharmacy+Mazen/"));
    fetchMock.mockResolvedValueOnce(new Response("nothing useful", { status: 200 }));
    expect(await (await call("https://maps.app.goo.gl/AbC123")).json()).toEqual({ query: "Pharmacy Mazen" });
  });

  it("never follows a redirect off Google", async () => {
    fetchMock.mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data/"));
    expect((await call("https://maps.app.goo.gl/AbC123")).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(redirect("https://evil.example/maps/@33.7,35.5,15z"));
    expect((await call("https://maps.app.goo.gl/AbC123")).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses anything that isn't a Maps link, and strangers", async () => {
    expect((await call("https://evil.example/x")).status).toBe(400);
    expect((await call("http://localhost:3000/admin")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    user.current = null;
    expect((await call("https://maps.app.goo.gl/AbC123")).status).toBe(401);
  });

  it("survives a dead link", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect((await call("https://maps.app.goo.gl/AbC123")).status).toBe(404);
  });
});
