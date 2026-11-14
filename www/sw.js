// 온라인이면 항상 최신 화면을 받고, 오프라인이면 마지막으로 받은 화면을 보여 줍니다.
var C = "saengmyeongnamu-v1";
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(r.url, { cache: "no-cache" }).then(function (res) {
      if (res.ok) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(r.url, cp); }); }
      return res;
    }).catch(function () {
      return caches.match(r.url).then(function (m) { return m || caches.match(new URL("./", location.href).href); });
    })
  );
});
