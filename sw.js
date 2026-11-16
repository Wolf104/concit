/* Concit's background helper. Its only job is phone notifications: it shows them when they arrive
   and opens the right plan when one is tapped. It does not store or cache any pages. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "Concit", {
    body: d.body || "Something new in one of your plans.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find(c => new URL(c.url).origin === self.location.origin);
    if (open) { open.postMessage({ openUrl: url }); return open.focus(); }
    return self.clients.openWindow(url);
  })());
});
