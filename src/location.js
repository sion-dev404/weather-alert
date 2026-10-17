// 위치 설정과 지역명 조회
// - 위치는 저장소의 location.json 을 우선 사용한다 (페이지의 "이 위치로 바꾸기" → GitHub 이슈 → Actions 가 갱신).
// - location.json 이 없으면 환경변수 NX, NY, LOCATION_NAME 을 쓴다.
// - 지역명이 비어 있으면 격자(NX, NY) → 위경도 → OpenStreetMap 역지오코딩으로 동 이름을 찾는다.
import { readFile } from 'node:fs/promises';

/** 위치 값 검사. { NX, NY, LOCATION_NAME } 또는 { nx, ny, name } 형식을 받는다. */
export function validateLocation(raw) {
  const nx = Number(raw?.nx ?? raw?.NX);
  const ny = Number(raw?.ny ?? raw?.NY);
  const name = String(raw?.name ?? raw?.LOCATION_NAME ?? '').trim();
  // 기상청 단기예보 격자 범위: X 1~149, Y 1~253
  if (!Number.isInteger(nx) || nx < 1 || nx > 149) throw new Error(`NX 값이 올바르지 않습니다: ${raw?.nx ?? raw?.NX}`);
  if (!Number.isInteger(ny) || ny < 1 || ny > 253) throw new Error(`NY 값이 올바르지 않습니다: ${raw?.ny ?? raw?.NY}`);
  if (name.length > 20 || (name && !/^[\p{L}\p{N} ·.\-]+$/u.test(name))) throw new Error(`지역명이 올바르지 않습니다: ${name}`);
  return { nx, ny, name };
}

/** location.json → 없으면 환경변수. 지역명이 없으면 조회한다. */
export async function loadLocation({ env = process.env, file = 'location.json' } = {}) {
  let cfg = null;
  try {
    cfg = validateLocation(JSON.parse(await readFile(file, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`${file} 무시 (환경변수 사용): ${e.message}`);
  }
  const nx = cfg?.nx ?? env.NX;
  const ny = cfg?.ny ?? env.NY;
  if (!nx || !ny) throw new Error('위치가 없습니다: location.json 또는 NX/NY 환경변수가 필요합니다.');
  // location.json 이 있으면 그 이름만 쓴다 (예전 위치의 LOCATION_NAME 이 섞이지 않도록)
  const name = await resolveLocationName({ name: cfg ? cfg.name : env.LOCATION_NAME, nx, ny });
  return { nx: String(nx), ny: String(ny), name };
}

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
