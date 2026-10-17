// 서비스 워커: 웹 푸시 수신 + 오프라인 대비 캐시
// 캐시는 "네트워크 우선": 인터넷이 되면 항상 최신 날씨를 받고, 끊겼을 때만 마지막으로 받은 화면·날씨를 보여 준다.
const CACHE = 'weather-v1';
const PRECACHE = ['./', 'index.html', 'weather.json', 'manifest.json', 'icon-192.png', 'icon.svg'];

self.addEventListener('install', (e) => {
  // 하나가 실패해도 나머지는 저장되도록 파일별로 담는다 (addAll 은 하나만 실패해도 전부 실패)
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 이전 버전 캐시 정리
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 같은 사이트의 GET 요청만 캐시 (글꼴 CDN, 지역명 조회 등 외부 요청은 그대로 통과)
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      // weather.json?t=... 처럼 주소 뒤 값이 달라도 찾을 수 있게 ignoreSearch
      const hit = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
      return hit || Response.error();
    }
  })());
});

// 서버(GitHub Actions)가 보낸 푸시: { title, body, url } 형식의 JSON
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || '오늘의 날씨', {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'badge-96.png', // 안드로이드 상태 표시줄용 단색 아이콘
    tag: 'morning-weather',
    data: { url: data.url || self.registration.scope },
  }));
});

// 알림을 누르면 날씨 페이지를 연다 (이미 열려 있으면 그 창으로 이동)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    return win ? win.focus() : self.clients.openWindow(url);
  })());
});
