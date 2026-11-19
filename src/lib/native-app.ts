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

/**
 * The apps' own calls plugin (iOS 1.5 / Android 1.4): calls ring like phone
 * calls -- CallKit on iPhone, a full-screen call notification on Android.
 * mobile/ios/App/App/CallsPlugin.swift, mobile/android/.../CallsPlugin.java.
 */
export type CallsPlugin = {
  /** iPhone: this install's PushKit token, once PushKit has given one. */
  getVoipToken(): Promise<{ token?: string }>;
  /** A call the phone answered or opened the app for before this page was listening. */
  takePending(): Promise<{ callId?: string; action?: "answer" | "ring" }>;
  /** Answer through the phone's own call screen; `handled` false when it doesn't know the call. */
  answer(o: { callId: string }): Promise<{ handled: boolean }>;
  /** The call connected: Android keeps the app alive with an ongoing-call notification. */
  callActive(o: { callId: string; name: string }): Promise<void>;
  /** The call is over (or declined here): the phone's ringing and call screens go away. */
  callEnded(o: { callId: string }): Promise<void>;
  /** Android builds from 1.5: whether incoming calls may take over the screen (Android 14+ asks). */
  fullScreenCalls?(): Promise<{ needsPermission: boolean; allowed: boolean }>;
  /** Android builds from 1.5: the phone's own switch for full-screen calls. */
  openFullScreenCallsSettings?(): Promise<void>;
  /** Builds from 1.6: loudspeaker on or off (no `on`: just ask). */
  speaker?(o?: { on?: boolean }): Promise<{ on: boolean }>;
  /** Builds from 1.6: the number on the app icon (iPhone; Android shows dots by itself). */
  setBadge?(o: { count: number }): Promise<void>;
  /** Builds from 1.6: a tap on the missed-call notification (or its buttons) the page wasn't listening for yet. */
  takeOpen?(): Promise<MissedCallOpen>;
  /** iPhone: sign in through Apple's sign-in sheet; the URL it came back with. */
  signIn?(o: { url: string; scheme: string }): Promise<{ url: string }>;
  addListener(event: "callAnswered" | "callEnded", cb: (e: { callId: string }) => void): Listener | Promise<Listener>;
  addListener(event: "voipToken", cb: (e: { token: string }) => void): Listener | Promise<Listener>;
  addListener(event: "open", cb: (e: MissedCallOpen) => void): Listener | Promise<Listener>;
};

/** Android's missed-call notification: opened, Call back or Message. */
export type MissedCallOpen = { action?: "calls" | "callback" | "message"; matchId?: string; name?: string };

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
    /** Android builds from 1.3: Google Play's install referrer (the app's own plugin). */
    InstallReferrer?: { get(): Promise<{ referrer: string | null }> };
    OuiCalls?: CallsPlugin;
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

/**
 * Where Google sign-in returns in the app. iOS can refuse the in-app
 * browser's automatic redirect into the app, so on iPhone it ends on a
 * page with a "Continue to ouiKnow" button (/auth/callback-app) instead.
 * Android follows the redirect fine.
 */
export function nativeOAuthRedirect() {
  const cap = capacitor();
  // Apple's sign-in sheet (iOS 1.5+) catches ouiknow:// itself.
  if (cap?.getPlatform() !== "ios" || cap.Plugins.OuiCalls?.signIn) return NATIVE_AUTH_CALLBACK;
  return `${window.location.origin}/auth/callback-app`;
}

/** The calls plugin, in app builds that have it. */
export function nativeCalls(): CallsPlugin | null {
  return capacitor()?.Plugins.OuiCalls ?? null;
}

/**
 * Google sign-in in an iPhone build with Apple's sign-in sheet
 * (ASWebAuthenticationSession): it returns to the app by itself, without
 * the in-app browser's redirect that iOS can refuse. Resolves to the
 * ouiknow:// URL it came back with, "cancelled" when the person closed the
 * sheet, or null when the build doesn't have the sheet.
 */
export async function nativeSignIn(url: string): Promise<string | "cancelled" | null> {
  const plugin = capacitor()?.Plugins.OuiCalls;
  if (!plugin?.signIn) return null;
  try {
    return (await plugin.signIn({ url, scheme: "ouiknow" })).url;
  } catch {
    return "cancelled";
  }
}

/** Finishes a sign-in that came back to the app (ouiknow://auth/callback?code=...). */
export function finishNativeSignIn(url: string) {
  if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
  const query = url.slice(NATIVE_AUTH_CALLBACK.length);
  // A route handler, not a page: it needs a real request to set the session cookies.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${window.location.origin}/auth/callback${query}`;
}

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

  // Builds that ring for calls say so; an iPhone adds its PushKit token.
  const calls = cap.Plugins.OuiCalls;
  const voipToken = calls && cap.getPlatform() === "ios" ? (await calls.getVoipToken().catch(() => ({ token: undefined }))).token : undefined;
  const res = await fetch("/api/push/native", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      platform: cap.getPlatform(),
      locale,
      voipToken,
      ringsCalls: calls ? true : undefined,
      missedCallActions: calls?.takeOpen && cap.getPlatform() === "android" ? true : undefined,
    }),
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
    // An oui-know.com link the app was opened with (an invite link):
    // that page, inside the app.
    const site = /^https:\/\/(www\.)?oui-know\.com(\/[^#]*)?/.exec(url);
    if (site) {
      // A full load: the app may have just started on this link.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${window.location.origin}${site[2] || "/"}`;
      return;
    }
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    cap.Plugins.Browser?.close().catch(() => {});
    finishNativeSignIn(url);
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

/**
 * What Google Play passed on when the Android app was installed from an
 * invite link ("ref=CODE&..."), or null: older builds, iPhone, the website,
 * or an install that didn't come from a link.
 */
export async function installReferrer(): Promise<string | null> {
  const cap = capacitor();
  if (cap?.getPlatform() !== "android" || !cap.Plugins.InstallReferrer) return null;
  try {
    return (await cap.Plugins.InstallReferrer.get()).referrer ?? null;
  } catch {
    return null;
  }
}
