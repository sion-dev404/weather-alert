// 단기예보 item 배열 → 오늘 날씨 요약 / 메시지 문구.

export const SKY = {
  1: { text: '맑음', emoji: '☀️' },
  3: { text: '구름많음', emoji: '⛅' },
  4: { text: '흐림', emoji: '☁️' },
};

export const PTY = {
  0: { text: '강수없음', emoji: '' },
  1: { text: '비', emoji: '🌧️' },
  2: { text: '비/눈', emoji: '🌨️' },
  3: { text: '눈', emoji: '❄️' },
  4: { text: '소나기', emoji: '🌦️' },
};

const num = (v) => (v === undefined ? null : Number(v));
const fmtTemp = (v) => (v === null || Number.isNaN(v) ? '-' : `${Math.round(v)}°`);

/**
 * @param {Array} items 최신 발표분 item
 * @param {string} today 'YYYYMMDD' (KST)
 * @param {Array} [tmnItems] 02시 발표분 item (TMN/TMX 보강용)
 */
export function summarizeToday(items, today, tmnItems = []) {
  const todayItems = items.filter((i) => i.fcstDate === today);

  // hour(0~23) → { TMP, POP, SKY, PTY ... }
  const byHour = new Map();
  for (const i of todayItems) {
    const hour = Number(i.fcstTime.slice(0, 2));
    if (!byHour.has(hour)) byHour.set(hour, {});
    byHour.get(hour)[i.category] = i.fcstValue;
  }

  // TMN/TMX: 최신 발표분에 없으면 02시 발표분에서 찾는다.
  const findDaily = (category) => {
    const hit =
      todayItems.find((i) => i.category === category) ??
      tmnItems.find((i) => i.category === category && i.fcstDate === today);
    return hit ? num(hit.fcstValue) : null;
  };
  let tmn = findDaily('TMN');
  let tmx = findDaily('TMX');

  const hourly = [...byHour.entries()].sort((a, b) => a[0] - b[0]);
  const temps = hourly.map(([, v]) => num(v.TMP)).filter((t) => t !== null);
  // 그래도 없으면 남은 시간대 기온으로 대체 (이미 지난 시간대는 빠져 있을 수 있음)
  if (tmn === null && temps.length) tmn = Math.min(...temps);
  if (tmx === null && temps.length) tmx = Math.max(...temps);

  const maxPop = (from, to) => {
    const vals = hourly
      .filter(([h]) => h >= from && h < to)
      .map(([, v]) => num(v.POP))
      .filter((p) => p !== null);
    return vals.length ? Math.max(...vals) : null;
  };

  // 가장 가까운 시각의 값을 대표 하늘상태로 쓴다 (오전=09시, 오후=15시)
  const skyAt = (target) => {
    const withSky = hourly.filter(([, v]) => v.SKY !== undefined);
    if (!withSky.length) return null;
    const [, v] = withSky.reduce((best, cur) =>
      Math.abs(cur[0] - target) < Math.abs(best[0] - target) ? cur : best,
    );
    return Number(v.SKY);
  };

  const ptyCodes = new Set(
    hourly.map(([, v]) => Number(v.PTY ?? 0)).filter((p) => p !== 0),
  );

  return {
    tmn,
    tmx,
    popAm: maxPop(0, 12),
    popPm: maxPop(12, 24),
    skyAm: skyAt(9),
    skyPm: skyAt(15),
    ptyCodes: [...ptyCodes].sort(),
    hourlyTemps: hourly
      .filter(([h]) => h % 3 === 0)
      .map(([h, v]) => ({ hour: h, temp: num(v.TMP) }))
      .filter((t) => t.temp !== null),
  };
}

const skyLabel = (code) => (SKY[code] ? `${SKY[code].emoji} ${SKY[code].text}` : '-');
const popLabel = (p) => (p === null ? '-' : `${p}%`);

/** 알림창용 짧은 형식: 제목 한 줄 + 본문 두세 줄 */
export function formatPush(s, today, location = '') {
  const m = Number(today.slice(4, 6));
  const d = Number(today.slice(6, 8));
  const sky = (code) => SKY[code]?.text ?? '-';
  const skyText = s.skyAm === s.skyPm ? sky(s.skyAm) : `${sky(s.skyAm)} → ${sky(s.skyPm)}`;
  const emoji = SKY[s.skyAm]?.emoji ?? '';
  const title = `${emoji} ${location ? location + ' ' : ''}${skyText} · ${fmtTemp(s.tmn)} / ${fmtTemp(s.tmx)}`.trim();

  const lines = [`${m}월 ${d}일 강수확률 오전 ${popLabel(s.popAm)} · 오후 ${popLabel(s.popPm)}`];
  if (s.hourlyTemps.length) {
    lines.push(s.hourlyTemps.map((t) => `${t.hour}시 ${fmtTemp(t.temp)}`).join(' · '));
  }
  if (s.ptyCodes.length) {
    lines.push(`☂️ ${s.ptyCodes.map((c) => PTY[c].text).join('·')} 예보가 있어요. 우산 챙기세요!`);
  }
  return { title, body: lines.join('\n') };
}

export function formatMessage(s, today) {
  const m = Number(today.slice(4, 6));
  const d = Number(today.slice(6, 8));
  const dow = '일월화수목금토'[new Date(Date.UTC(+today.slice(0, 4), m - 1, d)).getUTCDay()];

  const lines = [
    `📅 ${m}월 ${d}일 (${dow}) 오늘의 날씨`,
    '',
    `🌡 최저 ${fmtTemp(s.tmn)} / 최고 ${fmtTemp(s.tmx)}`,
    `${skyLabel(s.skyAm)} → ${skyLabel(s.skyPm)}`,
    `☔ 강수확률 오전 ${popLabel(s.popAm)} / 오후 ${popLabel(s.popPm)}`,
  ];

  if (s.hourlyTemps.length) {
    lines.push('', '⏰ 3시간 간격 기온');
    lines.push(s.hourlyTemps.map((t) => `${String(t.hour).padStart(2, '0')}시 ${fmtTemp(t.temp)}`).join('  '));
  }

  if (s.ptyCodes.length) {
    const kinds = s.ptyCodes.map((c) => `${PTY[c].emoji}${PTY[c].text}`).join('·');
    lines.push('', `☂️ ${kinds} 예보가 있어요. 우산 챙기세요!`);
  }

  return lines.join('\n');
}
