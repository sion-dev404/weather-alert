// 지역명 자동 조회: 기상청 격자(NX, NY) → 위경도 → OpenStreetMap 역지오코딩(동 이름)
// LOCATION_NAME 을 직접 넣으면 그 값을 우선 사용한다.

// 기상청 단기예보 격자 (Lambert Conformal Conic) 상수
const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0;
const XO = 43, YO = 136; // 기준점 격자 좌표

/** 기상청 격자 좌표 → 위도·경도 (기상청 공개 변환식의 역변환) */
export function gridToLatLon(nx, ny) {
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D, slat2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const xn = Number(nx) - XO;
  const yn = ro - Number(ny) + YO;
  let ra = Math.sqrt(xn * xn + yn * yn);
  if (sn < 0) ra = -ra;
  const alat = 2 * Math.atan(Math.pow((re * sf) / ra, 1 / sn)) - Math.PI * 0.5;
  let theta;
  if (Math.abs(xn) <= 0) theta = 0;
  else if (Math.abs(yn) <= 0) theta = xn < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
  else theta = Math.atan2(xn, yn);
  return { lat: alat / D, lon: (theta / sn + olon) / D };
}

/** OpenStreetMap 주소 → 표시용 지역명 (동 → 읍·면 → 구 → 시 순으로 가장 작은 단위) */
export function pickPlaceName(address = {}) {
  return (
    address.quarter || address.suburb || address.neighbourhood || address.village ||
    address.town || address.borough || address.city_district || address.city || address.county || ''
  );
}

export async function reverseGeocode(lat, lon) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.search = new URLSearchParams({ format: 'jsonv2', lat, lon, zoom: '14', 'accept-language': 'ko' });
  const res = await fetch(url, {
    // Nominatim 이용 정책: 앱을 식별할 수 있는 User-Agent 필요
    headers: { 'User-Agent': 'weather-alert (https://github.com/sion-dev404/weather-alert)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`역지오코딩 HTTP ${res.status}`);
  return pickPlaceName((await res.json()).address);
}

/** LOCATION_NAME 이 있으면 그대로, 없으면 격자 좌표로 조회. 실패하면 빈 문자열. */
export async function resolveLocationName({ name, nx, ny }) {
  if (name && name.trim()) return name.trim();
  try {
    const { lat, lon } = gridToLatLon(nx, ny);
    return await reverseGeocode(lat.toFixed(4), lon.toFixed(4));
  } catch (e) {
    console.warn(`지역명 조회 실패(무시): ${e.message}`);
    return '';
  }
}
