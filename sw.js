// 购车比价计算器 - Service Worker
// 版本号：每次更新文件时修改此处
const CACHE_NAME = 'car-calc-v10';

// 需要缓存的文件列表
const FILES_TO_CACHE = [
  './index.html',
  './src/quote-engine.js',
  './src/quote-schema.js',
  './src/share-codec.js',
  './src/local-evidence.js',
  './src/qr-adapter.js',
  './src/ocr-adapter.js',
  './src/pdf-report.js',
  './vendor/qrcode.min.js',
  './vendor/jszip.min.js',
  './vendor/html2canvas.min.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract-core/tesseract-core.wasm.js',
  './vendor/tesseract-core/tesseract-core-simd.wasm.js',
  './vendor/tesseract-core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract-lang/chi_sim.traineddata.gz',
  './vendor/tesseract-lang/eng.traineddata.gz',
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
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
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
