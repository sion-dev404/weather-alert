// 기상청 단기예보(getVilageFcst) 조회.
import { fetchJson } from './http.js';

const VILAGE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

/**
 * 포털에서 복사한 키가 Encoding 키(%2B 등 포함)든 Decoding 키든 동작하게 한다.
 * URLSearchParams 가 다시 인코딩하므로 항상 디코딩된 값을 넘겨야 한다.
 */
function normalizeKey(key) {
  if (!key) throw new Error('KMA_SERVICE_KEY 환경변수가 없습니다.');
  try {
    return /%[0-9A-Fa-f]{2}/.test(key) ? decodeURIComponent(key) : key;
  } catch {
    return key;
  }
}

/** 공공데이터포털 응답 공통 껍데기를 검사하고 item 배열을 꺼낸다. */
function extractItems(json) {
  const header = json?.response?.header;
  if (!header) throw new Error('예상하지 못한 응답 형식');
  if (header.resultCode !== '00') {
    throw new Error(`기상청 API 오류 ${header.resultCode}: ${header.resultMsg}`);
  }
  const items = json.response.body?.items?.item;
  if (!Array.isArray(items) || items.length === 0) throw new Error('예보 데이터가 비어 있습니다.');
  return items;
}

/** 단기예보 한 발표분을 가져온다. 반환: [{ category, fcstDate, fcstTime, fcstValue }, ...] */
export async function fetchVilageFcst({ serviceKey, nx, ny, baseDate, baseTime }) {
  const params = new URLSearchParams({
    serviceKey: normalizeKey(serviceKey),
    pageNo: '1',
    numOfRows: '1000', // 발표분 하나가 약 800~900행이라 한 번에 받는다.
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const json = await fetchJson(`${VILAGE_URL}?${params}`, `단기예보 ${baseDate} ${baseTime}`);
  return extractItems(json);
}
