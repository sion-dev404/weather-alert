// GitHub Pages 용 데이터 생성: 단기+중기예보 → site/weather.json
// 사용: node --env-file-if-exists=.env build-site.js
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchVilageFcst } from './src/kma.js';
import { fetchMidDays } from './src/mid.js';
import { getLatestVilageBase, getTodayTmnBase } from './src/kst.js';
import { buildSiteData } from './src/forecast.js';
import { resolveLocationName } from './src/location.js';

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(', ')}`);
}

async function main() {
  requireEnv('KMA_SERVICE_KEY', 'NX', 'NY');
  const { KMA_SERVICE_KEY: serviceKey, NX: nx, NY: ny, MID_LAND_REG_ID, MID_TA_REG_ID, LOCATION_NAME } = process.env;
  const now = new Date();

  const latest = getLatestVilageBase(now);
  const tmnBase = getTodayTmnBase(now);
  const sameAsLatest = tmnBase && tmnBase.baseDate === latest.baseDate && tmnBase.baseTime === latest.baseTime;

  const [items, tmnItems, midDays, location] = await Promise.all([
    fetchVilageFcst({ serviceKey, nx, ny, ...latest }),
    tmnBase && !sameAsLatest
      ? fetchVilageFcst({ serviceKey, nx, ny, ...tmnBase }).catch((e) => {
          console.warn(`02시 발표분 조회 실패(무시): ${e.message}`);
          return [];
        })
      : [],
    // 중기예보는 보강용이라 실패해도 단기예보만으로 페이지를 만든다.
    MID_LAND_REG_ID && MID_TA_REG_ID
      ? fetchMidDays({ serviceKey, landRegId: MID_LAND_REG_ID, taRegId: MID_TA_REG_ID, now }).catch((e) => {
          console.warn(`중기예보 조회 실패(무시): ${e.message}`);
          return [];
        })
      : [],
    // LOCATION_NAME 이 비어 있으면 격자 좌표로 지역명을 조회한다.
    resolveLocationName({ name: LOCATION_NAME, nx, ny }),
  ]);

  const data = buildSiteData({ items, tmnItems, midDays, now, location });
  // 화면에서 사용자 위치(브라우저 위치정보)의 격자와 비교하기 위해 날씨 기준 격자를 함께 넣는다.
  data.grid = { nx: Number(nx), ny: Number(ny) };
  await mkdir('site', { recursive: true });
  await writeFile('site/weather.json', JSON.stringify(data, null, 2), 'utf8');
  console.log(`site/weather.json 생성: 시간별 ${data.hourly.length}개, 일별 ${data.daily.length}일`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
