import { beforeEach, describe, expect, it, vi } from "vitest";

// The iPhone app: signing in and out don't reload the page, so what the
// module remembers has to survive them correctly.
function setup({ saveStatus = () => 200 }: { saveStatus?: () => number } = {}) {
  const store = new Map<string, string>();
  const saved: string[] = [];
  const listeners = new Map<string, (t: { value: string }) => void>();
  const push = {
    checkPermissions: async () => ({ receive: "granted" }),
    requestPermissions: async () => ({ receive: "granted" }),
    // Like Capacitor's real bridge (native-bridge.js, cap.addListener): a plain
    // object, not a promise. The bridge doesn't catch what a callback throws.
    addListener: (event: string, cb: (t: { value: string }) => void) => {
      listeners.set(event, cb);
      return { remove: async () => {} };
    },
    register: async () => listeners.get("registration")?.({ value: "phone-token" }),
  };
  vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { PushNotifications: push } } });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "DELETE") return { ok: true, status: 200 };
      const status = saveStatus();
      if (status === 200) saved.push(JSON.parse(String(init.body)).token);
      return { ok: status === 200, status };
    }),
  );
  return { saved };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("keeping the iPhone's push token on the account", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("saves it once however many pages open", async () => {
    const { saved } = setup();
    const { registerNativePushOnce } = await import("@/lib/native-app");
    registerNativePushOnce("en");
    await settle();
    registerNativePushOnce("en");
    await settle();
    expect(saved).toEqual(["phone-token"]);
  });

  it("saves it again after signing out and back in, without restarting the app", async () => {
    const { saved } = setup();
    const { registerNativePushOnce, disableNativePush } = await import("@/lib/native-app");
    registerNativePushOnce("en");
    await settle();
    await disableNativePush();
    registerNativePushOnce("en");
    await settle();
    expect(saved).toEqual(["phone-token", "phone-token"]);
  });

  it("tries again on the next page when saving failed", async () => {
    let status = 401;
    const { saved } = setup({ saveStatus: () => status });
    const { registerNativePushOnce } = await import("@/lib/native-app");
    registerNativePushOnce("en");
    await settle();
    expect(saved).toEqual([]);
    status = 200;
    registerNativePushOnce("en");
    await settle();
    expect(saved).toEqual(["phone-token"]);
  });
});
