const C = "fatcat-preview-20261107u";
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
  const mine = /preview/.test(C) ? "fatcat-preview-" : "fatcat-2-";
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
      c.postMessage({ type: "SW_UPDATED", cache: C });
      if (c.navigate) c.navigate(c.url).catch(() => null);
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
