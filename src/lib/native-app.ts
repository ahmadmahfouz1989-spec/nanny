/**
 * The website running inside the iOS/Android apps (mobile/, Capacitor).
 * The apps load the live site, and Capacitor injects `window.Capacitor`
 * with the native plugins -- so this talks to them through that global
 * rather than bundling Capacitor into the site. Client components only;
 * everything here is a no-op in a normal browser.
 */

type Listener = { remove: () => Promise<void> };
type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type PushPlugin = {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(event: "registration", cb: (t: { value: string }) => void): Promise<Listener>;
  addListener(event: "registrationError", cb: (e: unknown) => void): Promise<Listener>;
  addListener(
    event: "pushNotificationActionPerformed",
    cb: (a: { notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<Listener>;
};
type AppPlugin = { addListener(event: "appUrlOpen", cb: (e: { url: string }) => void): Promise<Listener> };
type BrowserPlugin = { open(o: { url: string }): Promise<void>; close(): Promise<void> };

type CapacitorGlobal = {
  isNativePlatform(): boolean;
  getPlatform(): "ios" | "android" | "web";
  Plugins: { PushNotifications?: PushPlugin; App?: AppPlugin; Browser?: BrowserPlugin };
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

export function isNativeApp() {
  return capacitor() !== null;
}

/** Where OAuth providers send the app back to (registered in Info.plist / AndroidManifest.xml). */
export const NATIVE_AUTH_CALLBACK = "ouiknow://auth/callback";

/** Opens a URL (e.g. Google sign-in, which refuses embedded web views) in the in-app system browser. */
export async function openInSystemBrowser(url: string) {
  await capacitor()?.Plugins.Browser?.open({ url });
}

// -- push -------------------------------------------------------------------

const TOKEN_KEY = "native-push-token";
// Set when someone turns push off on the Profile card, so launches stop
// turning it back on. Signing out doesn't set it.
const OPT_OUT_KEY = "native-push-off";

export function nativePushOptedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNativePushOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // ignore
  }
}

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function nativePushPermission(): Promise<PermissionState | null> {
  const push = capacitor()?.Plugins.PushNotifications;
  return push ? (await push.checkPermissions()).receive : null;
}

/** On when the OS allows it and this install's token is on the account. */
export async function nativePushOn() {
  return (await nativePushPermission()) === "granted" && !!storedToken();
}

/**
 * Asks for permission if it hasn't been decided (in the apps this needs no
 * tap), registers with APNs/FCM and saves the token on the signed-in
 * account. Resolves to the resulting permission.
 */
export async function enableNativePush(locale: string): Promise<PermissionState | null> {
  const cap = capacitor();
  const push = cap?.Plugins.PushNotifications;
  if (!cap || !push) return null;

  let { receive } = await push.checkPermissions();
  if (receive === "prompt" || receive === "prompt-with-rationale") ({ receive } = await push.requestPermissions());
  if (receive !== "granted") return receive;

  const token = await new Promise<string | null>((resolve) => {
    const listeners: Promise<Listener>[] = [];
    const done = (value: string | null) => {
      listeners.forEach((l) => l.then((h) => h.remove()).catch(() => {}));
      resolve(value);
    };
    listeners.push(push.addListener("registration", (t) => done(t.value)));
    listeners.push(push.addListener("registrationError", () => done(null)));
    push.register().catch(() => done(null));
  });
  if (!token) return receive;

  const res = await fetch("/api/push/native", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: cap.getPlatform(), locale }),
  });
  if (!res.ok) throw new Error(`native token save failed (${res.status})`);
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore -- only used to remove the token later
  }
  return receive;
}

/** Takes this install off the account (sign-out, or the Profile switch). */
export async function disableNativePush() {
  const token = storedToken();
  if (!token) return;
  await fetch("/api/push/native", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {});
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// -- app-wide listeners -----------------------------------------------------

let listening = false;

/**
 * Once per app launch: a tapped notification opens its page, and the
 * ouiknow:// sign-in return finishes signing in inside the app. The OAuth
 * code exchange runs in the app's own web view, which holds the PKCE
 * verifier from when sign-in started.
 */
export function listenForNativeEvents() {
  const cap = capacitor();
  if (!cap || listening) return;
  listening = true;

  cap.Plugins.PushNotifications?.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = notification.data?.url;
    if (typeof url === "string" && url.startsWith("/")) window.location.href = url;
  });

  cap.Plugins.App?.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    cap.Plugins.Browser?.close().catch(() => {});
    const query = url.slice(NATIVE_AUTH_CALLBACK.length);
    // A route handler, not a page: it needs a real request to set the session cookies.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${window.location.origin}/auth/callback${query}`;
  });
}
