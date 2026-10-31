/* 科研灵感图库 Service Worker（主站与静态镜像通用，均为相对作用域）
   策略：图片缓存优先；HTML/CSS/JS/JSON 网络优先、离线回退缓存；API 与写请求不缓存 */
const CACHE = "gallery-cache-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 动态接口永不缓存，避免看到过期数据
  if (url.pathname.includes("/api/")) return;

  // 图片：缓存优先
  if (req.destination === "image") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 页面与数据：网络优先，失败回退缓存（离线可浏览上次内容）
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      } catch {
        const hit = await caches.match(req);
        if (hit) return hit;
        return new Response("离线且无缓存", { status: 503 });
      }
    })()
  );
});
