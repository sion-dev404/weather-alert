// 단기예보 item 배열 → 웹페이지용 데이터(현재/시간별/일별).
import { SKY, PTY } from './summary.js';
import { toKst, ymd } from './kst.js';

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const DOW = '일월화수목금토';

export function weekdayOf(yyyymmdd) {
  return DOW[new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8))).getUTCDay()];
}

/** 하늘/강수 코드 → 아이콘·문구. 밤(19~05시)의 맑음은 달로 표시한다. */
export function conditionOf(sky, pty, hour) {
  if (pty) return { icon: PTY[pty]?.emoji || '🌧️', text: PTY[pty]?.text || '강수' };
  const base = SKY[sky];
  if (!base) return { icon: '', text: '-' };
  const night = hour !== undefined && (hour >= 19 || hour < 6);
  return { icon: night && sky === 1 ? '🌙' : base.emoji, text: base.text };
}

/** item 배열을 'YYYYMMDD' → hour → { 카테고리: 값 } 으로 묶는다. */
function groupByDateHour(items) {
  const byDate = new Map();
  for (const i of items) {
    if (!byDate.has(i.fcstDate)) byDate.set(i.fcstDate, new Map());
    const byHour = byDate.get(i.fcstDate);
    const hour = Number(i.fcstTime.slice(0, 2));
    if (!byHour.has(hour)) byHour.set(hour, {});
    byHour.get(hour)[i.category] = i.fcstValue;
  }
  return byDate;
}

/** 지금 시각부터 hours 시간 동안의 시간별 예보 */
export function buildHourly(items, now, hours = 24) {
  const kst = toKst(now);
  const startKey = ymd(kst) + String(kst.getUTCHours()).padStart(2, '0');
  const rows = [];
  for (const [date, byHour] of groupByDateHour(items)) {
    for (const [hour, v] of byHour) {
      rows.push({ key: date + String(hour).padStart(2, '0'), date, hour, v });
    }
  }
  return rows
    .filter((r) => r.key >= startKey && num(r.v.TMP) !== null)
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .slice(0, hours)
    .map(({ date, hour, v }) => ({
      date,
      hour,
      temp: num(v.TMP),
      pop: num(v.POP),
      ...conditionOf(num(v.SKY), num(v.PTY) ?? 0, hour),
    }));
}

/** 현재 기온: 지금 시각 이전 중 가장 가까운 예보 시각 값 (없으면 첫 시간별 값) */
export function buildCurrent(hourly) {
  return hourly[0] ?? null;
}

/** 단기예보 기반 일별 요약. tmnItems 는 오늘 최저기온(TMN) 보강용 02시 발표분. */
export function buildShortDaily(items, tmnItems = []) {
  const byDate = groupByDateHour(items);
  const days = [];
  for (const date of [...byDate.keys()].sort()) {
    const byHour = byDate.get(date);
    const all = [...items, ...tmnItems].filter((i) => i.fcstDate === date);
    const find = (cat) => {
      const hit = all.find((i) => i.category === cat);
      return hit ? num(hit.fcstValue) : null;
    };
    const temps = [...byHour.values()].map((v) => num(v.TMP)).filter((t) => t !== null);
    const hours = [...byHour.keys()].sort((a, b) => a - b);
    const pops = [...byHour.values()].map((v) => num(v.POP)).filter((p) => p !== null);
    const skyNear = (target) => {
      const withSky = hours.filter((h) => byHour.get(h).SKY !== undefined);
      if (!withSky.length) return { sky: null, pty: 0, hour: target };
      const h = withSky.reduce((b, c) => (Math.abs(c - target) < Math.abs(b - target) ? c : b));
      return { sky: num(byHour.get(h).SKY), pty: num(byHour.get(h).PTY) ?? 0, hour: target };
    };
    const hasPty = [...byHour.values()].find((v) => num(v.PTY) > 0);
    const am = skyNear(9);
    const pm = skyNear(15);
    if (hasPty && !am.pty && !pm.pty) pm.pty = num(hasPty.PTY);
    days.push({
      date,
      tmn: find('TMN') ?? (temps.length ? Math.min(...temps) : null),
      tmx: find('TMX') ?? (temps.length ? Math.max(...temps) : null),
      pop: pops.length ? Math.max(...pops) : null,
      am: conditionOf(am.sky, am.pty, 12),
      pm: conditionOf(pm.sky, pm.pty, 12),
      source: 'short',
      hourCount: hours.length,
    });
  }
  return days;
}

/** 서버 시각(now) 기준으로 시간별·일별·현재 데이터를 합쳐 페이지용 JSON을 만든다. */
export function buildSiteData({ items, tmnItems = [], midDays = [], now = new Date(), location = '' }) {
  const hourly = buildHourly(items, now);
  const today = ymd(toKst(now));
  const shortDays = buildShortDaily(items, tmnItems)
    // 예보가 몇 시간치만 걸친 마지막 날은 중기예보에 맡긴다.
    .filter((d) => d.date === today || (d.date > today && d.hourCount >= 8));
  const lastShort = shortDays.length ? shortDays[shortDays.length - 1].date : today;
  const mid = midDays.filter((d) => d.date > lastShort);
  const daily = [...shortDays, ...mid].map(({ hourCount, ...d }) => ({ ...d, dow: weekdayOf(d.date) }));
  const kst = toKst(now);
  return {
    location,
    updatedAt: now.toISOString(),
    updatedKst: `${ymd(kst)} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`,
    today,
    current: buildCurrent(hourly),
    today_range: daily[0] ? { tmn: daily[0].tmn, tmx: daily[0].tmx } : null,
    hourly,
    daily,
  };
}

