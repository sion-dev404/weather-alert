// KST(UTC+9) 기준 시간 유틸. 실행 환경(GitHub Actions=UTC)의 시간대와 무관하게 동작한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

// 단기예보 발표 시각(시). 발표 약 10분 뒤부터 API에서 조회된다.
export const VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
const PUBLISH_DELAY_MIN = 10;

/** 실제 시각(Date)을 "KST 벽시계" 값으로 가진 Date로 바꾼다. getUTC* 로 읽어야 KST 값이 나온다. */
export function toKst(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

/** KST Date → 'YYYYMMDD' */
export function ymd(kst) {
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
}

/** KST Date → 'HHmm' */
export function hhmm(kst) {
  return `${pad(kst.getUTCHours())}${pad(kst.getUTCMinutes())}`;
}

/** 'YYYYMMDD' 에 일 수를 더한다 (KST 날짜 기준). */
export function addDays(yyyymmdd, days) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  return ymd(new Date(Date.UTC(y, m, d + days)));
}

/**
 * 지금 조회 가능한 가장 최신 단기예보 발표분.
 * 예: KST 06:30 → { baseDate: 오늘, baseTime: '0500' }
 *     KST 01:30 → { baseDate: 어제, baseTime: '2300' }
 */
export function getLatestVilageBase(now = new Date()) {
  const kst = toKst(new Date(now.getTime() - PUBLISH_DELAY_MIN * 60 * 1000));
  const hour = kst.getUTCHours();
  const candidates = VILAGE_BASE_HOURS.filter((h) => h <= hour);
  if (candidates.length === 0) {
    return { baseDate: addDays(ymd(kst), -1), baseTime: '2300' };
  }
  return { baseDate: ymd(kst), baseTime: `${pad(Math.max(...candidates))}00` };
}

/**
 * 오늘 02시 발표분. 오늘 최저기온(TMN)은 02시 발표분에만 들어 있다.
 * 02:10 이전이라 아직 조회가 불가능하면 null.
 */
export function getTodayTmnBase(now = new Date()) {
  const kst = toKst(new Date(now.getTime() - PUBLISH_DELAY_MIN * 60 * 1000));
  if (kst.getUTCHours() < 2) return null;
  return { baseDate: ymd(kst), baseTime: '0200' };
}

/** KST 기준 오늘 날짜 'YYYYMMDD' */
export function getTodayKst(now = new Date()) {
  return ymd(toKst(now));
}

/** KST 기준 요일 (0=일 ... 6=토) */
export function getWeekdayKst(now = new Date()) {
  return toKst(now).getUTCDay();
}
