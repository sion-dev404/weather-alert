// GitHub Pages 용 데이터 생성: 단기+중기예보 → site/weather.json (기본 위치) + site/w/<기기ID>.json (등록 기기별 위치)
// 사용: node --env-file-if-exists=.env build-site.js
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSiteData } from './src/forecast.js';
import { loadLocation } from './src/location.js';
import { midRegionForGrid } from './src/midregion.js';
import { fetchShort, fetchMidCached } from './src/fetchers.js';
import { loadSubscriptions, groupByLocation } from './src/subs.js';

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(', ')}`);
}

/** 한 위치의 화면용 데이터 */
async function buildFor({ serviceKey, loc, mid, now }) {
  const [{ items, tmnItems }, midDays] = await Promise.all([
    fetchShort({ serviceKey, nx: loc.nx, ny: loc.ny, now }),
    fetchMidCached({ serviceKey, ...mid, now }),
  ]);
  const data = buildSiteData({ items, tmnItems, midDays, now, location: loc.name });
  // 화면에서 사용자 위치(브라우저 위치정보)의 격자와 비교하기 위해 날씨 기준 격자를 함께 넣는다.
  data.grid = { nx: Number(loc.nx), ny: Number(loc.ny) };
  data.mid = mid.city ?? null;
  return data;
}

async function main() {
  requireEnv('KMA_SERVICE_KEY');
  const { KMA_SERVICE_KEY: serviceKey, MID_LAND_REG_ID, MID_TA_REG_ID } = process.env;
  const now = new Date();

  // 1) 기본 위치 (location.json) — 등록하지 않은 사람이 보는 화면
  const owner = await loadLocation();
  const ownerKey = `${owner.nx},${owner.ny}`;
  // 기본 위치는 가장 가까운 대표 도시 기준. 단, 같은 권역이면 환경변수의 더 정확한 기온 코드를 쓴다.
  const nearest = midRegionForGrid(owner.nx, owner.ny);
  const ownerMid = MID_LAND_REG_ID === nearest.landRegId && MID_TA_REG_ID
    ? { ...nearest, taRegId: MID_TA_REG_ID }
    : nearest;
  const ownerData = await buildFor({ serviceKey, loc: owner, mid: ownerMid, now });
  await mkdir('site/w', { recursive: true });
  await writeFile('site/weather.json', JSON.stringify(ownerData, null, 2), 'utf8');
  console.log(`site/weather.json 생성 (${owner.name}): 시간별 ${ownerData.hourly.length}개, 일별 ${ownerData.daily.length}일`);

  // 2) 등록된 기기별 위치 — 기기 ID(무작위) 이름의 파일로 만든다 (파일 이름으로는 누구·어디인지 알 수 없음)
  const devices = (await loadSubscriptions()).filter((t) => t.wid);
  let written = 0, failed = 0;
  for (const g of groupByLocation(devices, owner)) {
    let data;
    try {
      data = `${g.loc.nx},${g.loc.ny}` === ownerKey
        ? ownerData
        : await buildFor({ serviceKey, loc: g.loc, mid: midRegionForGrid(g.loc.nx, g.loc.ny), now });
    } catch (e) {
      failed += g.targets.length;
      console.warn(`기기 ${g.targets.length}대의 위치 예보 실패(기본 화면으로 대체): ${e.message}`);
      continue;
    }
    for (const t of g.targets) {
      // 같은 격자라도 기기마다 자기 동 이름을 쓴다
      const out = { ...data, location: t.loc?.name || data.location };
      await writeFile(`site/w/${t.wid}.json`, JSON.stringify(out), 'utf8');
      written++;
    }
  }
  console.log(`기기별 날씨 파일 ${written}개 생성${failed ? `, 실패 ${failed}개` : ''}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
