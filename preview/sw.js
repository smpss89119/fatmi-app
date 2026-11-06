const C = "fatcat-preview-20261107a";
const F = [
  "./",
  "index.html",
  "app.js",
  "app.css",
  "data.js",
  "data.json",
  "body-svg.js",
  "version.json",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(F)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => x.startsWith("fatcat-preview-") && x !== C).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("message", (e) => {
  const data = e.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const path = u.pathname;
  const netFirst = path.endsWith("data.json") || path.endsWith("version.json");
  if (netFirst) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((r) => {
          const copy = r.clone();
          caches.open(C).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (r) =>
        r ||
        fetch(e.request).catch(() =>
          e.request.mode === "navigate" ? caches.match("index.html") : Response.error()
        )
    )
  );
});
