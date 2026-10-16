// 아침 날씨 알림: 단기예보 → 오늘 요약 → 텔레그램 전송
// 사용: node --env-file-if-exists=.env send-weather.js [--dry-run]
import { fetchVilageFcst } from './src/kma.js';
import { getLatestVilageBase, getTodayTmnBase, getTodayKst } from './src/kst.js';
import { summarizeToday, formatMessage } from './src/summary.js';
import { sendTelegram } from './src/telegram.js';

const dryRun = process.argv.includes('--dry-run');

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(', ')}`);
}

async function main() {
  requireEnv('KMA_SERVICE_KEY', 'NX', 'NY');
  const { KMA_SERVICE_KEY: serviceKey, NX: nx, NY: ny } = process.env;
  const now = new Date();
  const today = getTodayKst(now);

  const latest = getLatestVilageBase(now);
  const tmnBase = getTodayTmnBase(now);
  // 최신 발표분이 이미 02시 발표분이면 한 번만 조회한다.
  const sameAsLatest = tmnBase && tmnBase.baseDate === latest.baseDate && tmnBase.baseTime === latest.baseTime;

  const [items, tmnItems] = await Promise.all([
    fetchVilageFcst({ serviceKey, nx, ny, ...latest }),
    tmnBase && !sameAsLatest
      ? fetchVilageFcst({ serviceKey, nx, ny, ...tmnBase }).catch((e) => {
          // 02시 분은 보강용이라 실패해도 최신 발표분만으로 진행한다.
          console.warn(`02시 발표분 조회 실패(무시): ${e.message}`);
          return [];
        })
      : [],
  ]);

  const message = formatMessage(summarizeToday(items, today, tmnItems), today);

  if (dryRun) {
    console.log(message);
    return;
  }
  await sendTelegram(message);
  console.log('텔레그램 전송 완료');
}

main().catch(async (err) => {
  console.error(err.message);
  if (!dryRun) {
    try {
      await sendTelegram(`⚠️ 날씨 알림 실패\n${err.message}`);
    } catch (e) {
      console.error(`실패 알림도 전송하지 못했습니다: ${e.message}`);
    }
  }
  process.exit(1);
});
