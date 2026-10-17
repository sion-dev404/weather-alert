// 웹 푸시 전송 (web-push + VAPID)
// 기기 목록은 src/subs.js 가 만든다 (push-subscriptions.json + Secret PUSH_SUBSCRIPTION).
import webpush from 'web-push';
import { loadSubscriptions, removeExpired } from './subs.js';

const PAGE_URL = 'https://sion-dev404.github.io/weather-alert/';

function setVapid() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 환경변수가 없습니다.');
  webpush.setVapidDetails(PAGE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** 구독 하나로 보낸다 (등록 확인 알림용) */
export async function sendPushTo(sub, { title, body, url = PAGE_URL }) {
  setVapid();
  await webpush.sendNotification(sub, JSON.stringify({ title, body, url }), { TTL: 6 * 3600 });
}

/**
 * 지정한 기기들에 같은 알림을 보낸다.
 * 반환: { ok: 성공 수, expired: 만료(404/410)되어 지워야 할 암호문 목록 }
 */
export async function sendToTargets(targets, { title, body, url = PAGE_URL }) {
  setVapid();
  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.allSettled(targets.map((t) => webpush.sendNotification(t.sub, payload, { TTL: 6 * 3600 })));
  const expired = [];
  results.forEach((r, i) => {
    if (r.status !== 'rejected') return;
    const code = r.reason?.statusCode;
    // 404/410 은 브라우저에서 구독이 해지된 것 (앱 삭제, 사이트 데이터 삭제 등)
    if ((code === 404 || code === 410) && targets[i].blob) expired.push(targets[i].blob);
    console.warn(`기기 전송 실패: ${code ?? ''} ${r.reason?.message ?? r.reason}`);
  });
  return { ok: results.filter((r) => r.status === 'fulfilled').length, expired };
}

/** 등록된 모든 기기에 같은 알림을 보낸다 (실패 안내용). 만료된 구독은 파일에서 지운다. */
export async function sendPush(message) {
  const targets = await loadSubscriptions();
  if (!targets.length) throw new Error('등록된 알림 기기가 없습니다. 페이지에서 "아침 알림 설정하기"를 눌러 주세요.');
  const { ok, expired } = await sendToTargets(targets, message);
  const removed = await removeExpired(expired);
  if (!ok) throw new Error(`모든 기기(${targets.length}대)에 푸시 전송 실패`);
  return { ok, total: targets.length, removed };
}
