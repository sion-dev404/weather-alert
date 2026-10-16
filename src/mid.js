// 기상청 중기예보(육상/기온) 조회 → 일별 요약. 단기예보가 끝난 뒤(3~10일 후)를 채운다.
import { fetchJson } from './http.js';
import { toKst, ymd, addDays } from './kst.js';

const BASE = 'https://apis.data.go.kr/1360000/MidFcstInfoService';

function normalizeKey(key) {
  try {
    return /%[0-9A-Fa-f]{2}/.test(key) ? decodeURIComponent(key) : key;
  } catch {
    return key;
  }
}

/** 중기예보 발표 기준 시각(tmFc): 06시·18시 발표, 발표 10분 뒤부터 조회 가능 */
export function getMidBase(now = new Date()) {
  const kst = toKst(new Date(now.getTime() - 10 * 60 * 1000));
  const hour = kst.getUTCHours();
  if (hour < 6) return { baseDate: addDays(ymd(kst), -1), tmFc: `${addDays(ymd(kst), -1)}1800` };
  return { baseDate: ymd(kst), tmFc: `${ymd(kst)}${hour < 18 ? '0600' : '1800'}` };
}

async function fetchMid(path, { serviceKey, regId, tmFc }, label) {
  const params = new URLSearchParams({
    serviceKey: normalizeKey(serviceKey),
    pageNo: '1',
    numOfRows: '10',
    dataType: 'JSON',
    regId,
    tmFc,
  });
  const json = await fetchJson(`${BASE}/${path}?${params}`, label);
  const header = json?.response?.header;
  if (header?.resultCode !== '00') throw new Error(`중기예보 오류 ${header?.resultCode}: ${header?.resultMsg}`);
  const item = json.response.body?.items?.item?.[0];
  if (!item) throw new Error('중기예보 데이터가 비어 있습니다.');
  return item;
}

/** 중기 날씨 문구 → 아이콘 */
export function midCondition(text) {
  if (!text) return { icon: '', text: '-' };
  let icon = '☀️';
  if (/눈/.test(text) && /비/.test(text)) icon = '🌨️';
  else if (/눈/.test(text)) icon = '❄️';
  else if (/소나기/.test(text)) icon = '🌦️';
  else if (/비/.test(text)) icon = '🌧️';
  else if (/흐림/.test(text)) icon = '☁️';
  else if (/구름/.test(text)) icon = '⛅';
  return { icon, text };
}

/**
 * 중기 육상·기온 응답 → 일별 배열.
 * 3~7일 후는 오전/오후, 8~10일 후는 하루 단위 값이다.
 */
export function parseMid(land, ta, baseDate) {
  const days = [];
  for (let n = 3; n <= 10; n++) {
    const hasHalf = n <= 7;
    const wfAm = hasHalf ? land[`wf${n}Am`] : land[`wf${n}`];
    const wfPm = hasHalf ? land[`wf${n}Pm`] : land[`wf${n}`];
    const tmn = ta[`taMin${n}`] ?? null;
    const tmx = ta[`taMax${n}`] ?? null;
    if (!wfAm && !wfPm && tmn === null && tmx === null) continue;
    const pops = (hasHalf ? [land[`rnSt${n}Am`], land[`rnSt${n}Pm`]] : [land[`rnSt${n}`]]).filter(
      (p) => p !== undefined && p !== null,
    );
    days.push({
      date: addDays(baseDate, n),
      tmn,
      tmx,
      pop: pops.length ? Math.max(...pops) : null,
      am: midCondition(wfAm),
      pm: midCondition(wfPm),
      source: 'mid',
    });
  }
  return days;
}

export async function fetchMidDays({ serviceKey, landRegId, taRegId, now = new Date() }) {
  const { baseDate, tmFc } = getMidBase(now);
  const [land, ta] = await Promise.all([
    fetchMid('getMidLandFcst', { serviceKey, regId: landRegId, tmFc }, `중기육상예보 ${tmFc}`),
    fetchMid('getMidTa', { serviceKey, regId: taRegId, tmFc }, `중기기온예보 ${tmFc}`),
  ]);
  return parseMid(land, ta, baseDate);
}

