// 성경 데이터(bible-*.js)와 vendor/* 는 파일명에 버전이 있어 캐시 우선,
// 나머지는 온라인이면 최신 화면(네트워크 우선)을 쓰되 3초 안에 응답이 없으면 캐시를 먼저 보여 줍니다.
var C = "saengmyeongnamu-v2";
var SLOW = 3000;
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
function isStatic(u) {
  var p = u.pathname, f = p.slice(p.lastIndexOf("/") + 1);
  return /^bible-.*\.js$/.test(f) || p.indexOf("/vendor/") >= 0;
}
function put(url, res) {
  if (res && res.ok) { var cp = res.clone(); return caches.open(C).then(function (c) { return c.put(url, cp); }).catch(function () {}); }
}
function fallback(url) {
  return caches.match(url).then(function (m) {
    return m || caches.match(new URL("./", location.href).href).then(function (h) {
      return h || caches.match(new URL("index.html", location.href).href);
    });
  });
}
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (isStatic(u)) {
    e.respondWith(
      caches.match(r.url).then(function (m) {
        if (m) return m;
        return fetch(r.url).then(function (res) { put(r.url, res); return res; });
      })
    );
    return;
  }
  e.respondWith(new Promise(function (resolve) {
    var settled = false, timer = 0;
    function once(v) { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } }
    var net = fetch(r.url, { cache: "no-cache" }).then(function (res) {
      var p = put(r.url, res);
      if (res.ok) { if (p) e.waitUntil(p); }
      once(res);
      return res;
    });
    net.catch(function () { fallback(r.url).then(function (m) { m ? once(m) : net.then(once, function () { once(Response.error()); }); }); });
    timer = setTimeout(function () {
      caches.match(r.url).then(function (m) { if (m) once(m); });
    }, SLOW);
    e.waitUntil(net.catch(function () {}));
  }));
});
