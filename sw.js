/* Service worker: network-first for everything (so deploys show up at once), cache fallback offline.
   Cached data responses carry "X-From-Cache: 1" so the page can show the offline notice. */
const VERSION = "syva-public-v5";
const SHELL = [
  "./", "index.html", "app.js", "manifest.webmanifest",
  "shared/styles.css", "shared/config.js", "shared/i18n.js", "shared/charts.js", "shared/core.js", "shared/icon.svg",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "i18n/fi.json", "i18n/sv.json", "i18n/en.json",
];
const DATA = ["data/meta.json", "data/stats.json", "data/sites.geojson", "data/grid.geojson"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.concat(DATA))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.pathname;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
    return r;
  }).catch(async () => {
    const hit = (await caches.match(key)) || (await caches.match(e.request, { ignoreSearch: true }));
    if (!hit) return Response.error();
    if (!url.pathname.includes("/data/")) return hit;
    const h = new Headers(hit.headers); h.set("X-From-Cache", "1");
    return new Response(await hit.blob(), { status: 200, headers: h });
  }));
});
