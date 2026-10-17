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

test('위치 값 검사: 페이지 형식과 파일 형식 모두 받는다', async () => {
  const { validateLocation } = await import('../src/location.js');
  assert.deepEqual(validateLocation({ NX: 63, NY: 124, LOCATION_NAME: ' 중앙동 ' }), { nx: 63, ny: 124, name: '중앙동' });
  assert.deepEqual(validateLocation({ nx: '63', ny: '124', name: '' }), { nx: 63, ny: 124, name: '' });
  assert.throws(() => validateLocation({ NX: 0, NY: 124 }), /NX/);
  assert.throws(() => validateLocation({ NX: 63, NY: 999 }), /NY/);
  assert.throws(() => validateLocation({ NX: 63, NY: 124, LOCATION_NAME: '<script>' }), /지역명/);
});

test('location.json 이 환경변수보다 우선한다', async () => {
  const { loadLocation } = await import('../src/location.js');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'loc-'));
  const file = join(dir, 'location.json');
  await writeFile(file, JSON.stringify({ nx: 63, ny: 124, name: '중앙동' }));
  const env = { NX: '60', NY: '127', LOCATION_NAME: '예전동' };
  assert.deepEqual(await loadLocation({ env, file }), { nx: '63', ny: '124', name: '중앙동' });
  // 파일이 없으면 환경변수
  assert.deepEqual(await loadLocation({ env, file: join(dir, 'none.json') }), { nx: '60', ny: '127', name: '예전동' });
});
