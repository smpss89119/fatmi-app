// Same file is published to /staging/, /preview/ and root; cache prefix follows the path so they never share caches.
const STAMP = "20261115r3";
const P = /\/staging\//.test(self.location.pathname) ? "fatcat-staging-" : /\/preview\//.test(self.location.pathname) ? "fatcat-preview-" : "fatcat-2-";
const C = P + STAMP;
const F = [
  "./",
  "index.html",
  "app.js",
  "app.css",
  "data.js",
  "data.json",
  "body-svg.js",
  "version.json",
  "manifest.webmanifest?v=preview-30",
  "icon-180-20261107p25.png",
  "icon-512-20261107p25.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(F)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  const mine = P;
  let upgraded = false;
  e.waitUntil(
    caches.keys().then((k) => {
      const old = k.filter((x) => x.startsWith(mine) && x !== C);
      upgraded = old.length > 0;
      return Promise.all(old.map((x) => caches.delete(x)));
    }).then(() => self.clients.claim())
  );
  // After activation finishes (not inside waitUntil, to avoid a fetch deadlock),
  // reload open windows so an old page picks up the new code without reopening.
  setTimeout(() => {
    if (!upgraded) return;
    self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => {
      // The page decides (reloads only when not mid-set / typing).
      c.postMessage({ type: "SW_UPDATED", cache: C });
    }));
  }, 1500);
});
self.addEventListener("message", (e) => {
  const data = e.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const path = u.pathname;
  const netFirst = path.endsWith("data.json") || path.endsWith("version.json") || path.endsWith("manifest.webmanifest") || /icon-\d+/.test(path);
  if (netFirst) {
    // ?t= cache-busters: store one copy per path (not per query) so the cache never grows.
    const key = u.origin + u.pathname;
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((r) => {
          if (r && r.ok) { const copy = r.clone(); caches.open(C).then((c) => c.put(key, copy)); }
          return r;
        })
        .catch(() => caches.match(key, { ignoreSearch: true }))
    );
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((r) => {
        if (r && r.ok && e.request.method === "GET") {
          const copy = r.clone();
          caches.open(C).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(
          (r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
