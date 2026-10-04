// ouiKnow service worker. Pages and /api responses are per-user, so nothing
// dynamic is cached: it shows /offline.html when a page navigation fails
// because the network is gone, and displays web push notifications
// (sent by src/lib/push.ts as { title, body, url, tag }).
// Bump CACHE when offline.html or the icons change.
const CACHE = "ouiknow-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL)),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // not JSON -- fall through to the defaults
  }
  // Every push must show a notification (userVisibleOnly), even a malformed one.
  event.waitUntil(
    self.registration.showNotification(data.title || "ouiKnow", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open ouiKnow window rather than stacking new ones.
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      // navigate() only works on windows this worker controls; otherwise
      // (or if it fails) open a fresh one.
      if (existing) {
        return existing
          .focus()
          .then((w) => (w ?? existing).navigate(url))
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
