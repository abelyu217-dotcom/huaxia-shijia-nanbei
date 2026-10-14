const CACHE_NAME = "hwo-v1";
const OFFLINE_URL = "/offline.html";

// 缓存核心页面
const CORE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
];

// 安装：预缓存核心资源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch：网络优先（API），缓存优先（静态资源）
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 请求不走缓存
  if (url.pathname.startsWith("/api/")) return;

  // SSE 流不走缓存
  if (event.request.headers.get("accept")?.includes("text/event-stream")) return;

  // 静态资源：缓存优先
  if (event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            // 缓存成功的响应
            if (response.ok && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // 离线时返回离线页面
            if (event.request.mode === "navigate") {
              return caches.match(OFFLINE_URL);
            }
          });
      })
    );
  }
});

// Push 推送通知
self.addEventListener("push", (event) => {
  let data = { title: "HWO 通知", body: "" };
  if (event.data) {
    try {
      data = JSON.parse(event.data.text());
    } catch {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.data || {},
    })
  );
});

// 点击通知跳转
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
