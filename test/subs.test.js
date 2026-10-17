import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decryptSubscription, loadSubscriptions, removeExpired, readSubsFile } from '../src/subs.js';

// 페이지(site/index.html)의 실제 암호화 코드를 꺼내 Node 의 WebCrypto 로 실행한다.
async function pageEncryptor(publicKey) {
  // 윈도우에서 git 이 CRLF 로 체크아웃해도 같은 정규식이 맞도록 줄바꿈을 LF 로 맞춘다
  const html = (await readFile(new URL('../site/index.html', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const pick = (re) => html.match(re)[0];
  const src = [
    pick(/const b64ToBytes = [\s\S]*?\n};\n/),
    pick(/const bytesToB64 = .*\n/),
    pick(/async function encryptSub[\s\S]*?\n}\n/),
  ].join('\n');
  return new Function('SUB_ENC_PUBLIC_KEY', `${src}\nreturn encryptSub;`)(publicKey);
}

const keypair = () => {
  const e = crypto.createECDH('prime256v1');
  e.generateKeys();
  return { pub: e.getPublicKey('base64url'), priv: e.getPrivateKey('base64url') };
};
const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${n}`, expirationTime: null, keys: { p256dh: `p${n}`, auth: `a${n}` } });

test('페이지에서 암호화한 구독을 서버가 복호화한다', async () => {
  const { pub, priv } = keypair();
  const encrypt = await pageEncryptor(pub);
  const blob = await encrypt(sub(1));
  assert.match(blob, /^[A-Za-z0-9_-]+$/); // 이슈 본문에 그대로 넣을 수 있는 문자만
  assert.deepEqual(decryptSubscription(blob, priv), sub(1));
});

test('다른 키나 변조된 암호문은 거부한다', async () => {
  const a = keypair(), b = keypair();
  const blob = await (await pageEncryptor(a.pub))(sub(1));
  assert.throws(() => decryptSubscription(blob, b.priv));
  const box = JSON.parse(Buffer.from(blob, 'base64url').toString());
  box.ct = box.ct.slice(0, -2) + (box.ct.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => decryptSubscription(Buffer.from(JSON.stringify(box)).toString('base64url'), a.priv));
});

test('파일 구독 + 예전 Secret 구독을 합치고 endpoint 로 중복 제거', async () => {
  const { pub, priv } = keypair();
  const encrypt = await pageEncryptor(pub);
  const dir = await mkdtemp(join(tmpdir(), 'subs-'));
  const file = join(dir, 'push-subscriptions.json');
  await writeFile(file, JSON.stringify([await encrypt(sub(1)), await encrypt(sub(2)), 'broken']));
  const env = { SUB_ENC_PRIVATE_KEY: priv, PUSH_SUBSCRIPTION: JSON.stringify([sub(2), sub(3)]) };
  const list = await loadSubscriptions({ env, file });
  assert.deepEqual(list.map((t) => t.sub.endpoint.slice(-6)), ['test-1', 'test-2', 'test-3']);
  assert.ok(list[0].blob && list[1].blob && !list[2].blob); // 파일에서 온 것만 지울 수 있다

  // 만료된 구독 정리
  assert.equal(await removeExpired([list[0].blob], file), 1);
  assert.equal((await readSubsFile(file)).length, 2);
});

test('새 목록 형식({ blob, by })과 예전 형식(문자열)을 함께 읽고 정리한다', async () => {
  const { pub, priv } = keypair();
  const encrypt = await pageEncryptor(pub);
  const dir = await mkdtemp(join(tmpdir(), 'subs-'));
  const file = join(dir, 'push-subscriptions.json');
  const b1 = await encrypt(sub(1)), b2 = await encrypt(sub(2));
  await writeFile(file, JSON.stringify([b1, { blob: b2, by: 'friend', at: '2026-10-17' }]));
  const list = await loadSubscriptions({ env: { SUB_ENC_PRIVATE_KEY: priv }, file });
  assert.equal(list.length, 2);
  assert.equal(await removeExpired([b2], file), 1);
  assert.deepEqual(await readSubsFile(file), [b1]);
});

test('다른 계정은 1인당 3대까지만 등록된다 (주인은 제한 없음)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { pub, priv } = keypair();
  const encrypt = await pageEncryptor(pub);
  const dir = await mkdtemp(join(tmpdir(), 'subs-'));
  const existing = [];
  for (let i = 1; i <= 3; i++) existing.push({ blob: await encrypt(sub(i)), by: 'friend', at: '2026-10-17' });
  await writeFile(join(dir, 'push-subscriptions.json'), JSON.stringify(existing));
  const script = new URL('../scripts/add-subscription.js', import.meta.url);
  const run = (author) => spawnSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '', ISSUE_AUTHOR: author, REPO_OWNER: 'owner', SUB_ENC_PRIVATE_KEY: priv, ISSUE_BODY: `SUB:${blob4}` },
  });
  const blob4 = await encrypt(sub(4));
  const r = run('friend');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /최대 3대/);
  assert.equal((await readSubsFile(join(dir, 'push-subscriptions.json'))).length, 3); // 파일은 그대로
});
