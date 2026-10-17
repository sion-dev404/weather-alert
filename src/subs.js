// 알림 구독 목록 관리
// - 페이지가 구독 정보를 공개키로 암호화해 GitHub 이슈로 보내면, Actions 가 복호화해 검사한 뒤
//   암호문 그대로 push-subscriptions.json 에 모은다 (공개 저장소라 평문은 어디에도 남기지 않는다).
// - 암호화: ECDH P-256 + HKDF-SHA256 + AES-256-GCM. 복호화 키는 Secret SUB_ENC_PRIVATE_KEY.
// - 예전 방식의 Secret PUSH_SUBSCRIPTION 도 함께 읽는다 (endpoint 기준 중복 제거).
import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export const SUBS_FILE = 'push-subscriptions.json';
const INFO = Buffer.from('weather-alert-sub');

/** 페이지에서 만든 암호문 문자열(base64url JSON) → 구독 객체 */
export function decryptSubscription(blob, privateKey) {
  const { v, epk, iv, ct } = JSON.parse(Buffer.from(blob, 'base64url').toString('utf8'));
  if (v !== 1) throw new Error('알 수 없는 구독 암호문 형식');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  const shared = ecdh.computeSecret(Buffer.from(epk, 'base64url'));
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(0), INFO, 32));
  const data = Buffer.from(ct, 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(data.subarray(-16)); // WebCrypto 는 인증 태그(16바이트)를 암호문 끝에 붙인다
  const plain = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]).toString('utf8');
  return validateSubscription(JSON.parse(plain));
}

export function validateSubscription(s) {
  if (typeof s?.endpoint !== 'string' || !s.endpoint.startsWith('https://')) throw new Error('구독 endpoint 가 올바르지 않습니다.');
  if (!s.keys?.p256dh || !s.keys?.auth) throw new Error('구독 keys 가 빠졌습니다.');
  return { endpoint: s.endpoint, expirationTime: s.expirationTime ?? null, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export async function readSubsFile(file = SUBS_FILE) {
  try {
    const list = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function writeSubsFile(blobs, file = SUBS_FILE) {
  await writeFile(file, JSON.stringify(blobs, null, 2) + '\n', 'utf8');
}

/**
 * 보낼 구독 목록: 파일(암호문) + Secret PUSH_SUBSCRIPTION(평문, 예전 방식).
 * 각 항목은 { sub, blob } — blob 이 있으면 파일에서 온 것이라 만료 시 지울 수 있다.
 */
export async function loadSubscriptions({ env = process.env, file = SUBS_FILE } = {}) {
  const out = [];
  const seen = new Set();
  const add = (sub, blob = null) => {
    if (seen.has(sub.endpoint)) return;
    seen.add(sub.endpoint);
    out.push({ sub, blob });
  };

  const blobs = await readSubsFile(file);
  if (blobs.length && !env.SUB_ENC_PRIVATE_KEY) console.warn('SUB_ENC_PRIVATE_KEY 가 없어 등록된 구독 파일을 읽지 못했습니다.');
  else for (const blob of blobs) {
    try { add(decryptSubscription(blob, env.SUB_ENC_PRIVATE_KEY), blob); } catch (e) { console.warn(`구독 1개 복호화 실패(무시): ${e.message}`); }
  }

  if (env.PUSH_SUBSCRIPTION) {
    try {
      const parsed = JSON.parse(env.PUSH_SUBSCRIPTION);
      for (const s of Array.isArray(parsed) ? parsed : [parsed]) add(validateSubscription(s));
    } catch (e) {
      console.warn(`PUSH_SUBSCRIPTION 무시: ${e.message}`);
    }
  }
  return out;
}

/** 만료된 구독을 파일에서 지운다. 지운 개수를 돌려준다. */
export async function removeExpired(blobs, file = SUBS_FILE) {
  if (!blobs.length) return 0;
  const list = await readSubsFile(file);
  const next = list.filter((b) => !blobs.includes(b));
  if (next.length !== list.length) await writeSubsFile(next, file);
  return list.length - next.length;
}
