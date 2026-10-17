import test from 'node:test';
import assert from 'node:assert/strict';
import { gridToLatLon, pickPlaceName, resolveLocationName } from '../src/location.js';

test('격자 → 위경도: 기준점(43,136)은 북위 38°, 동경 126°', () => {
  const { lat, lon } = gridToLatLon(43, 136);
  assert.ok(Math.abs(lat - 38) < 1e-6);
  assert.ok(Math.abs(lon - 126) < 1e-6);
});

test('격자 → 위경도: 서울 종로(60,127)', () => {
  const { lat, lon } = gridToLatLon(60, 127);
  assert.ok(Math.abs(lat - 37.58) < 0.02, `lat=${lat}`);
  assert.ok(Math.abs(lon - 126.99) < 0.02, `lon=${lon}`);
});

test('주소에서 가장 작은 단위(동)를 고른다', () => {
  assert.equal(pickPlaceName({ quarter: '하대원동', borough: '중원구', city: '성남시' }), '하대원동');
  assert.equal(pickPlaceName({ borough: '중원구', city: '성남시' }), '중원구');
  assert.equal(pickPlaceName({}), '');
});

test('LOCATION_NAME 이 있으면 조회하지 않고 그대로 쓴다', async () => {
  assert.equal(await resolveLocationName({ name: ' 중앙동 ', nx: 60, ny: 127 }), '중앙동');
});
