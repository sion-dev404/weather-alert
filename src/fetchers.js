// 한 위치(격자)의 예보를 가져오는 공통 함수 (화면용 빌드와 아침 알림에서 함께 사용)
import { fetchVilageFcst } from './kma.js';
import { fetchMidDays } from './mid.js';
import { getLatestVilageBase, getTodayTmnBase } from './kst.js';

/** 단기예보: 최신 발표분 + 오늘 최저기온(TMN)이 들어 있는 02시 발표분 */
export async function fetchShort({ serviceKey, nx, ny, now = new Date() }) {
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
  return { items, tmnItems };
}

/** 중기예보 (같은 지역 코드는 한 번만 조회하도록 실행 중 캐시). 실패하면 빈 배열. */
const midCache = new Map();
export function fetchMidCached({ serviceKey, landRegId, taRegId, now = new Date() }) {
  if (!landRegId || !taRegId) return Promise.resolve([]);
  const key = `${landRegId}/${taRegId}`;
  if (!midCache.has(key)) {
    midCache.set(key, fetchMidDays({ serviceKey, landRegId, taRegId, now }).catch((e) => {
      // 중기예보는 보강용이라 실패해도 단기예보만으로 진행한다.
      console.warn(`중기예보 조회 실패(무시, ${key}): ${e.message}`);
      return [];
    }));
  }
  return midCache.get(key);
}
