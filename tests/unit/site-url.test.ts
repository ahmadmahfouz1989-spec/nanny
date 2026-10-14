import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalHostRedirect } from "@/lib/site-url";

describe("canonicalHostRedirect", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends the bare domain to the www APP_URL, keeping path and query", () => {
    vi.stubEnv("APP_URL", "https://www.oui-know.com");
    expect(canonicalHostRedirect("oui-know.com", "/en/feed?post=1")).toBe("https://www.oui-know.com/en/feed?post=1");
  });

  it("sends www to a bare APP_URL", () => {
    vi.stubEnv("APP_URL", "https://oui-know.com/");
    expect(canonicalHostRedirect("WWW.oui-know.com", "/")).toBe("https://oui-know.com/");
  });

  it("leaves the canonical host, other hosts, and an unset APP_URL alone", () => {
    vi.stubEnv("APP_URL", "https://www.oui-know.com");
    expect(canonicalHostRedirect("www.oui-know.com", "/en")).toBeNull();
    expect(canonicalHostRedirect("app.up.railway.app", "/en")).toBeNull();
    expect(canonicalHostRedirect("localhost:3000", "/en")).toBeNull();
    expect(canonicalHostRedirect(null, "/en")).toBeNull();
    vi.stubEnv("APP_URL", "");
    expect(canonicalHostRedirect("oui-know.com", "/en")).toBeNull();
  });
});
