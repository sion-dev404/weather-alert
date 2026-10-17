import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { nearestMidRegion, midRegionForGrid, MID_CITIES } from '../src/midregion.js';
import { decryptEntry, groupByLocation } from '../src/subs.js';

test('가장 가까운 중기예보 지역: 대표 도시 좌표는 자기 코드', () => {
  for (const [city, lat, lon, ta, land] of MID_CITIES) {
    assert.deepEqual(nearestMidRegion(lat, lon), { city, taRegId: ta, landRegId: land });
  }
});

test('격자 → 중기예보 권역: 성남 중앙동(63,124)은 수도권, 부산 해운대 근처는 부산', () => {
  assert.equal(midRegionForGrid(63, 124).landRegId, '11B00000');
  assert.equal(midRegionForGrid(99, 75).landRegId, '11H20000');
});

async function pageEncryptor(publicKey) {
  const html = (await readFile(new URL('../site/index.html', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const pick = (re) => html.match(re)[0];
  const src = [pick(/const b64ToBytes = [\s\S]*?\n};\n/), pick(/const bytesToB64 = .*\n/), pick(/async function encryptSub[\s\S]*?\n}\n/)].join('\n');
  return new Function('SUB_ENC_PUBLIC_KEY', `${src}\nreturn encryptSub;`)(publicKey);
}

test('구독 + 위치 + 기기 ID 암호문을 풀고, 이상한 위치·ID 는 버린다', async () => {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const encrypt = await pageEncryptor(e.getPublicKey('base64url'));
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } };
  const wid = 'a'.repeat(32);
  const ok = decryptEntry(await encrypt({ ...sub, wid, loc: { nx: 98, ny: 76, name: '우동' } }), e.getPrivateKey('base64url'));
  assert.deepEqual(ok.loc, { nx: 98, ny: 76, name: '우동' });
  assert.equal(ok.wid, wid);
  const bad = decryptEntry(await encrypt({ ...sub, wid: '../hack', loc: { nx: 999, ny: 1 } }), e.getPrivateKey('base64url'));
  assert.equal(bad.loc, null);
  assert.equal(bad.wid, null); // 파일 이름에 쓰이므로 16진수만 허용
});

test('기기를 격자별로 묶고, 위치 없는 기기는 기본 위치로', () => {
  const owner = { nx: '63', ny: '124', name: '중앙동' };
  const t = (n, loc) => ({ sub: { endpoint: `e${n}` }, loc });
  const groups = groupByLocation([t(1, null), t(2, { nx: 98, ny: 76, name: '우동' }), t(3, { nx: 63, ny: 124, name: '신흥동' }), t(4, { nx: 98, ny: 76, name: '중동' })], owner);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.targets.length), [2, 2]);
});
