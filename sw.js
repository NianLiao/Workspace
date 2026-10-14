/* 年辽的知识工作台 · 离线缓存
 * 策略：先网络后缓存——在线时永远是最新版（改了代码重新上传即生效），
 * 断网或 GitHub 在国内抽风时秒回缓存，应用照常可用。 */
const CACHE = "nianliao-shell-v1";
const SHELL = ["./", "./index.html", "./css/style.css", "./js/app.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 中转/GitHub API 等跨域请求一律放行不缓存
  e.respondWith(
    Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500))
    ]).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req).then(m =>
      m || (req.mode === "navigate" ? caches.match("./index.html") : m)))
  );
});
