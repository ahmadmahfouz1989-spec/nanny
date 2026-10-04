/**
 * Browser side of web push: subscribe this device via the service worker
 * and tell /api/push/subscription about it. Client components only.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushSupport = "supported" | "unsupported" | "needs-install" | "unconfigured";

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasApi) return "supported";
  // iOS only exposes push to apps added to the home screen (16.4+).
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return ios ? "needs-install" : "unsupported";
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  // Idempotent: returns the existing worker if ServiceWorkerRegister already
  // registered it (and works in dev, where that component skips it).
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function saveSubscription(sub: PushSubscription, locale: string) {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscription", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, locale }),
  });
  if (!res.ok) throw new Error(`subscription save failed (${res.status})`);
}

/** Asks for permission if needed. Resolves to the resulting permission. */
export async function enablePush(locale: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  await saveSubscription(sub, locale);
  return permission;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/api/push/subscription", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * Re-sends this device's subscription so the server has the current account
 * and app language (both can change after subscribing). Once per tab session.
 */
export async function syncPushSubscription(locale: string) {
  try {
    const key = `push-synced:${locale}`;
    if (sessionStorage.getItem(key)) return;
    const sub = await currentSubscription();
    if (!sub || Notification.permission !== "granted") return;
    await saveSubscription(sub, locale);
    sessionStorage.setItem(key, "1");
  } catch {
    // best-effort
  }
}
