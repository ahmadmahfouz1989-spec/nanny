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
  addListener(event: "registration", cb: (t: { value: string }) => void): Listener | Promise<Listener>;
  addListener(event: "registrationError", cb: (e: unknown) => void): Listener | Promise<Listener>;
  addListener(
    event: "pushNotificationActionPerformed",
    cb: (a: { notification: { data?: Record<string, unknown> } }) => void,
  ): Listener | Promise<Listener>;
};
type AppPlugin = { addListener(event: "appUrlOpen", cb: (e: { url: string }) => void): Listener | Promise<Listener> };
type BrowserPlugin = { open(o: { url: string }): Promise<void>; close(): Promise<void> };
type HapticsPlugin = {
  impact(o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
  notification(o: { type: "SUCCESS" | "WARNING" | "ERROR" }): Promise<void>;
};

type AppleSignInPlugin = {
  authorize(o: { clientId: string; redirectURI: string; scopes?: string; nonce?: string }): Promise<{
    response: { identityToken: string; email: string | null };
  }>;
};

type BgLocation = { latitude: number; longitude: number; accuracy: number; time: number | null };
type BgError = { code?: string; message?: string };
type BackgroundGeolocationPlugin = {
  addWatcher(
    options: { backgroundTitle?: string; backgroundMessage?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
    callback: (location?: BgLocation, error?: BgError) => void,
  ): Promise<string>;
  removeWatcher(o: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
  checkPermissions?(): Promise<{ location?: PermissionState }>;
  requestPermissions?(): Promise<{ location?: PermissionState }>;
};
type HttpPlugin = {
  post(o: { url: string; headers?: Record<string, string>; data?: unknown }): Promise<{ status: number; data: unknown }>;
};

type CapacitorGlobal = {
  isNativePlatform(): boolean;
  getPlatform(): "ios" | "android" | "web";
  Plugins: {
    PushNotifications?: PushPlugin;
    App?: AppPlugin;
    Browser?: BrowserPlugin;
    Haptics?: HapticsPlugin;
    SignInWithApple?: AppleSignInPlugin;
    BackgroundGeolocation?: BackgroundGeolocationPlugin;
    CapacitorHttp?: HttpPlugin;
  };
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

// -- Sign in with Apple ------------------------------------------------------

/** The iPhone app has native Sign in with Apple (builds from before the plugin don't). */
export function hasNativeAppleSignIn() {
  const cap = capacitor();
  return cap?.getPlatform() === "ios" && !!cap.Plugins.SignInWithApple;
}

/**
 * Apple's sign-in sheet. Resolves to the identity token, or null when the
 * person closes the sheet. `hashedNonce` is the SHA-256 of the nonce later
 * handed to Supabase, which checks the two match.
 */
export async function nativeAppleSignIn(hashedNonce: string): Promise<string | null> {
  const plugin = capacitor()?.Plugins.SignInWithApple;
  if (!plugin) return null;
  try {
    const { response } = await plugin.authorize({
      clientId: "com.ouiknow.app",
      redirectURI: "",
      scopes: "email",
      nonce: hashedNonce,
    });
    return response.identityToken || null;
  } catch (e) {
    // Error 1001 is the person cancelling; anything else is a real failure.
    if (String(e).includes("1001")) return null;
    throw e;
  }
}

// -- haptics ----------------------------------------------------------------

/**
 * A small buzz for things you did (liked, saved, sent, posted, refreshed),
 * like X's app -- never for plain taps or navigation. No-op in a browser
 * and in app builds from before the Haptics plugin.
 */
export function haptic(kind: "light" | "medium" | "success" = "light") {
  const haptics = capacitor()?.Plugins.Haptics;
  if (!haptics) return;
  const done = kind === "success" ? haptics.notification({ type: "SUCCESS" }) : haptics.impact({ style: kind === "medium" ? "MEDIUM" : "LIGHT" });
  done.catch(() => {});
}

// -- push -------------------------------------------------------------------

const TOKEN_KEY = "native-push-token";

function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
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
    // Capacitor's bridge hands back the listener itself, not a promise of it.
    const listeners: (Listener | Promise<Listener>)[] = [];
    const done = (value: string | null) => {
      resolve(value);
      listeners.forEach((l) => void Promise.resolve(l).then((h) => h.remove()).catch(() => {}));
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

// Signing in and out don't reload the page, so this outlives both.
let registeredLocale: string | null = null;

/**
 * Keeps this install's token on the signed-in account. Pages call it freely:
 * it runs once per launch and language, and tries again on the next page if
 * the token didn't get saved.
 */
export function registerNativePushOnce(locale: string) {
  if (registeredLocale === locale) return;
  registeredLocale = locale;
  const retry = () => {
    if (registeredLocale === locale) registeredLocale = null;
  };
  enableNativePush(locale).then(() => {
    if (!storedToken()) retry();
  }, retry);
}

/** Takes this install off the account when signing out. */
export async function disableNativePush() {
  // The next account signing in on this phone needs it saved again.
  registeredLocale = null;
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

// -- Background location (a delivery in progress) ---------------------------

/** App builds with background location (1.2+); older ones and browsers don't. */
export function hasBackgroundLocation() {
  return !!capacitor()?.Plugins.BackgroundGeolocation;
}

/**
 * Watches the phone's location even with the app in the background (Android
 * shows `title`/`message` as an ongoing notification; iPhone shows the blue
 * location indicator). Returns the watcher's id, or null without the plugin.
 */
export async function watchBackgroundLocation(
  notice: { title: string; message: string },
  onLocation: (l: { lat: number; lng: number; accuracy: number }) => void,
  onDenied: () => void,
): Promise<string | null> {
  const cap = capacitor();
  const plugin = cap?.Plugins.BackgroundGeolocation;
  if (!plugin) return null;
  // Android: ask first. Left to addWatcher, the plugin starts its location
  // service before the answer (Android refuses it) and never hears the answer,
  // so nothing is sent until the app is reopened.
  if (cap?.getPlatform() === "android" && plugin.requestPermissions) {
    let { location } = (await plugin.checkPermissions?.().catch(() => null)) ?? {};
    if (location !== "granted") ({ location } = (await plugin.requestPermissions().catch(() => null)) ?? {});
    if (location !== "granted") {
      onDenied();
      return null;
    }
  }
  return plugin.addWatcher(
    { backgroundTitle: notice.title, backgroundMessage: notice.message, requestPermissions: true, stale: false, distanceFilter: 25 },
    (location, error) => {
      if (error) {
        if (error.code === "NOT_AUTHORIZED") onDenied();
        return;
      }
      if (location) onLocation({ lat: location.latitude, lng: location.longitude, accuracy: location.accuracy });
    },
  );
}

export async function stopBackgroundLocation(id: string) {
  await capacitor()?.Plugins.BackgroundGeolocation?.removeWatcher({ id }).catch(() => {});
}

/**
 * A JSON POST that keeps working with the app in the background: through the
 * native connection in the apps (Android slows the web view's own requests
 * after a few minutes in the background), a normal fetch elsewhere.
 */
export async function postJson(url: string, body: unknown): Promise<unknown> {
  const http = capacitor()?.Plugins.CapacitorHttp;
  if (http) {
    const res = await http.post({ url: new URL(url, window.location.origin).toString(), headers: { "Content-Type": "application/json" }, data: body });
    return res.data;
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => null);
}
