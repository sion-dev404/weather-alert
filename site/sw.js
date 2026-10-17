// 웹 푸시 수신용 서비스 워커. 캐시는 하지 않는다 (날씨는 항상 최신 데이터를 받아야 하므로).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 서버(GitHub Actions)가 보낸 푸시: { title, body, url } 형식의 JSON
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || '오늘의 날씨', {
    body: data.body || '',
    icon: 'icon.svg',
    badge: 'icon.svg',
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
