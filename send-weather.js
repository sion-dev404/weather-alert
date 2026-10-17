// 아침 날씨 알림: 등록된 기기를 동네(격자)별로 묶어 → 동네마다 단기예보 → 오늘 요약
// → 매우 덥거나·춥거나·비/눈이 오는 동네에만 웹 푸시 전송 (기준: src/summary.js 의 ALERT)
// 사용: node --env-file-if-exists=.env send-weather.js [--dry-run] [--always]
//   --always: 조건과 관계없이 모든 동네에 보낸다 (시험용)
import { getTodayKst } from './src/kst.js';
import { summarizeToday, formatPush, alertReasons } from './src/summary.js';
import { sendPush, sendToTargets } from './src/push.js';
import { loadLocation } from './src/location.js';
import { fetchShort } from './src/fetchers.js';
import { loadSubscriptions, groupByLocation, removeExpired } from './src/subs.js';

const dryRun = process.argv.includes('--dry-run');
const always = process.argv.includes('--always');

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(', ')}`);
}

async function main() {
  requireEnv('KMA_SERVICE_KEY');
  const { KMA_SERVICE_KEY: serviceKey } = process.env;
  const owner = await loadLocation(); // 위치 없이 등록된 기기는 기본 위치로 보낸다
  const now = new Date();
  const today = getTodayKst(now);

  const targets = await loadSubscriptions();
  if (!targets.length && !dryRun) throw new Error('등록된 알림 기기가 없습니다. 페이지에서 "아침 알림 설정하기"를 눌러 주세요.');
  // 미리보기인데 기기가 없으면 기본 위치 하나만 보여 준다
  const groups = targets.length ? groupByLocation(targets, owner) : [{ loc: owner, targets: [] }];

  let ok = 0, total = 0, failedAreas = 0, quiet = 0;
  const expired = [];
  // 공개 저장소라 Actions 로그도 공개된다. 기기 위치(격자·기온)는 로그에 남기지 않고 순번만 쓴다.
  for (const [gi, g] of groups.entries()) {
    const area = `동네 ${gi + 1}`;
    let summary;
    try {
      const { items, tmnItems } = await fetchShort({ serviceKey, nx: g.loc.nx, ny: g.loc.ny, now });
      summary = summarizeToday(items, today, tmnItems);
    } catch (e) {
      failedAreas++;
      total += g.targets.length;
      console.warn(`${area} 예보 실패 (기기 ${g.targets.length}대): ${e.message}`);
      continue;
    }
    // 매우 덥거나·춥거나·비/눈이 오는 날만 보낸다
    const reasons = alertReasons(summary);
    if (!reasons.length && !always) {
      quiet += g.targets.length;
      console.log(`${area}: 알릴 날씨 없음 → 기기 ${g.targets.length}대 건너뜀`);
      continue;
    }
    // 같은 격자라도 기기마다 자기 동 이름으로 제목을 단다
    const byName = new Map();
    for (const t of g.targets.length ? g.targets : [{ loc: null }]) {
      const name = t.loc?.name || g.loc.name || owner.name;
      if (!byName.has(name)) byName.set(name, []);
      if (t.sub) byName.get(name).push(t);
    }
    for (const [name, list] of byName) {
      const message = formatPush(summary, today, name, reasons);
      if (dryRun) {
        console.log(`[${list.length}대] ${message.title}\n${message.body}\n`);
        continue;
      }
      const r = await sendToTargets(list, message);
      ok += r.ok;
      total += list.length;
      expired.push(...r.expired);
    }
  }
  if (dryRun) return;

  const removed = await removeExpired(expired);
  if (removed) console.log(`만료된 구독 ${removed}개를 목록에서 지웠습니다.`);
  console.log(`웹 푸시 전송 완료 (${ok}/${total}대, 동네 ${groups.length}곳${quiet ? `, 알릴 날씨 없어 건너뜀 ${quiet}대` : ''}${failedAreas ? `, 예보 실패 ${failedAreas}곳` : ''})`);
  // 보낼 대상이 있었는데 하나도 못 보냈을 때만 실패로 본다 (조용한 날은 정상)
  if (total && !ok) throw new Error(`모든 기기(${total}대)에 알림을 보내지 못했습니다.`);
}

main().catch(async (err) => {
  console.error(err.message);
  if (!dryRun) {
    try {
      await sendPush({ title: '⚠️ 날씨 알림 실패', body: err.message });
    } catch (e) {
      console.error(`실패 알림도 전송하지 못했습니다: ${e.message}`);
    }
  }
  process.exit(1);
});
