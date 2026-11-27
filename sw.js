/* Petmate Aftercare — 보호자 카톡 안내 가이드 서비스 워커
 *  - 가이드 페이지(index.html / /Test/): 네트워크 우선 → 수정 사항이 바로 반영, 오프라인일 때만 캐시
 *  - 아이콘·매니페스트 등 정적 자산: 캐시 우선 + 백그라운드 갱신
 *  - 다른 출처(SheetJS CDN 등)와 GET 이외 요청은 가로채지 않음
 */
var CACHE_PREFIX = 'petmate-aftercare-';
var CACHE_NAME = CACHE_PREFIX + 'v3';
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async function (url) {
      try {
        var res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
      } catch (err) {
        /* 설치 중 오프라인이면 그 자산만 건너뜀 */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) {
      /* 이 앱 접두사가 붙은 옛 캐시만 정리 (같은 출처의 다른 페이지 캐시는 건드리지 않음) */
      if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) return caches.delete(key);
      return null;
    }));
    await self.clients.claim();
  })());
});

function isGuidePage(url) {
  return url.pathname === '/Test' ||
         url.pathname === '/Test/' ||
         url.pathname === '/Test/index.html';
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return; /* CDN 등 외부 요청은 그대로 통과 */

  /* 1) 가이드 페이지: 네트워크 우선, 실패하면 캐시 */
  if (req.mode === 'navigate' || isGuidePage(url)) {
    event.respondWith((async function () {
      try {
        var res = await fetch(url.href, { credentials: 'same-origin', cache: 'no-cache' });
        if (res && res.ok) {
          var cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', res.clone()).catch(function () {});
        }
        return res;
      } catch (err) {
        var cache2 = await caches.open(CACHE_NAME);
        var hit = (await cache2.match('./index.html')) || (await cache2.match('./'));
        if (hit) return hit;
        return new Response('오프라인 상태이고 이 기기에 저장된 사본이 없습니다.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  /* 2) 정적 자산(아이콘·매니페스트·og 이미지): 캐시 우선 + 백그라운드 갱신 */
  event.respondWith((async function () {
    var cache = await caches.open(CACHE_NAME);
    var hit = await cache.match(req);
    if (hit) {
      fetch(req).then(function (res) {
        if (res && res.ok) return cache.put(req, res.clone());
        return null;
      }).catch(function () {});
      return hit;
    }
    try {
      var res2 = await fetch(req);
      if (res2 && res2.ok) cache.put(req, res2.clone()).catch(function () {});
      return res2;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
