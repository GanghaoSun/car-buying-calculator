// 购车比价计算器 - Service Worker
// 版本号：每次更新文件时修改此处
const CACHE_NAME = 'car-calc-v6';

// 需要缓存的文件列表
const FILES_TO_CACHE = [
  './index.html',
  './data/policy.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 安装：缓存所有文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 拦截请求：政策配置网络优先，其余静态资源优先返回缓存
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('/data/policy.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => {
        // 网络也失败时，返回主页面（离线兜底）
        return caches.match('./index.html');
      });
    })
  );
});
