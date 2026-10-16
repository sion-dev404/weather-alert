import test from 'node:test';
import assert from 'node:assert/strict';
import { getLatestVilageBase, getTodayTmnBase, getTodayKst, addDays } from '../src/kst.js';
import { summarizeToday, formatMessage } from '../src/summary.js';

// KST 시각을 UTC Date로 만든다 (KST = UTC+9)
const kst = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi));

test('발표 시각: KST 06:30 → 오늘 0500', () => {
  assert.deepEqual(getLatestVilageBase(kst(2026, 10, 17, 6, 30)), { baseDate: '20261017', baseTime: '0500' });
});
test('발표 시각: 05:05(발표 10분 전) → 0200', () => {
  assert.equal(getLatestVilageBase(kst(2026, 10, 17, 5, 5)).baseTime, '0200');
});
test('발표 시각: 01:30 → 어제 2300', () => {
  assert.deepEqual(getLatestVilageBase(kst(2026, 10, 17, 1, 30)), { baseDate: '20261016', baseTime: '2300' });
});
test('발표 시각: UTC 날짜와 KST 날짜가 다른 때(UTC 21:30 = KST 06:30)', () => {
  const d = new Date('2026-10-16T21:30:00Z');
  assert.equal(getTodayKst(d), '20261017');
  assert.deepEqual(getTodayTmnBase(d), { baseDate: '20261017', baseTime: '0200' });
});
test('02시 발표분: 02:05 이전엔 null', () => {
  assert.equal(getTodayTmnBase(kst(2026, 10, 17, 2, 5)), null);
});
test('addDays 월 경계', () => {
  assert.equal(addDays('20261031', 1), '20261101');
  assert.equal(addDays('20261101', -1), '20261031');
});

const item = (category, fcstDate, fcstTime, fcstValue) => ({ category, fcstDate, fcstTime, fcstValue });
const T = '20261017';

test('요약: 최신 발표분에 TMN이 없으면 02시 발표분에서 가져온다', () => {
  const latest = [];
  for (let h = 6; h <= 23; h += 3) {
    const t = String(h).padStart(2, '0') + '00';
    latest.push(item('TMP', T, t, String(10 + h / 3)), item('POP', T, t, h < 12 ? '20' : '70'));
    latest.push(item('SKY', T, t, '3'), item('PTY', T, t, h >= 15 ? '1' : '0'));
  }
  latest.push(item('TMX', T, '1500', '18.0'));
  const early = [item('TMN', T, '0600', '7.0')];

  const s = summarizeToday(latest, T, early);
  assert.equal(s.tmn, 7);
  assert.equal(s.tmx, 18);
  assert.equal(s.popAm, 20);
  assert.equal(s.popPm, 70);
  assert.deepEqual(s.ptyCodes, [1]);

  const msg = formatMessage(s, T);
  assert.match(msg, /최저 7° \/ 최고 18°/);
  assert.match(msg, /구름많음/);
  assert.match(msg, /우산/);
  assert.match(msg, /06시 12°/);
});

test('요약: 강수 없으면 우산 문구 없음', () => {
  const items = [item('TMP', T, '0900', '10'), item('SKY', T, '0900', '1'), item('PTY', T, '0900', '0')];
  const msg = formatMessage(summarizeToday(items, T), T);
  assert.doesNotMatch(msg, /우산/);
  assert.match(msg, /맑음/);
});
