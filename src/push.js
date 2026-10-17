// 웹 푸시 전송 (web-push + VAPID). 구독 정보는 PUSH_SUBSCRIPTION 환경변수에 둔다.
// PUSH_SUBSCRIPTION 은 구독 객체 하나 또는 여러 기기의 구독 배열(JSON)이다.
import webpush from 'web-push';

const PAGE_URL = 'https://sion-dev404.github.io/weather-alert/';

export function parseSubscriptions(raw) {
  if (!raw) throw new Error('PUSH_SUBSCRIPTION 환경변수가 없습니다.');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PUSH_SUBSCRIPTION 이 올바른 JSON 이 아닙니다.');
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.length || list.some((s) => !s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth)) {
    throw new Error('PUSH_SUBSCRIPTION 에 endpoint/keys 가 빠진 구독이 있습니다.');
  }
  return list;
}

/** 모든 구독 기기에 알림을 보낸다. 하나라도 성공하면 성공, 전부 실패하면 오류. */
export async function sendPush({ title, body, url = PAGE_URL }) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 환경변수가 없습니다.');
  webpush.setVapidDetails(PAGE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subs = parseSubscriptions(PUSH_SUBSCRIPTION);
  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification(s, payload, { TTL: 6 * 3600 })));

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = r.reason?.statusCode;
      // 404/410 은 브라우저에서 구독이 해지된 것. 다시 "알림 설정하기"로 구독해야 한다.
      const hint = code === 404 || code === 410 ? ' (구독 만료: 페이지에서 알림을 다시 설정하세요)' : '';
      console.warn(`기기 ${i + 1} 전송 실패: ${code ?? ''} ${r.reason?.message ?? r.reason}${hint}`);
    }
  });
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  if (!ok) throw new Error(`모든 기기(${subs.length}대)에 푸시 전송 실패`);
  return { ok, total: subs.length };
}
