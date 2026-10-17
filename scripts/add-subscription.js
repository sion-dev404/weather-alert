// GitHub 이슈 본문의 암호화된 구독 → push-subscriptions.json 에 추가 (subscribe.yml 워크플로에서 실행)
// 이슈 본문 예: "... SUB:<base64url 암호문>"
import { appendFile } from 'node:fs/promises';
import { decryptSubscription, readSubsFile, writeSubsFile } from '../src/subs.js';
import { sendPushTo } from '../src/push.js';

const { ISSUE_BODY = '', SUB_ENC_PRIVATE_KEY } = process.env;
const output = (line) => (process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, line + '\n') : null);

async function main() {
  if (!SUB_ENC_PRIVATE_KEY) throw new Error('SUB_ENC_PRIVATE_KEY 가 없습니다.');
  const blob = ISSUE_BODY.match(/SUB:([A-Za-z0-9_-]+)/)?.[1];
  if (!blob) throw new Error('이슈 본문에서 구독 정보(SUB:...)를 찾지 못했습니다.');
  const sub = decryptSubscription(blob, SUB_ENC_PRIVATE_KEY); // 복호화·형식 검사에 실패하면 여기서 중단

  // 같은 기기(endpoint)가 이미 있으면 새 것으로 바꾼다
  const list = await readSubsFile();
  const kept = list.filter((b) => {
    try { return decryptSubscription(b, SUB_ENC_PRIVATE_KEY).endpoint !== sub.endpoint; } catch { return false; }
  });
  const replaced = kept.length !== list.length;
  await writeSubsFile([...kept, blob]);
  console.log(`구독 ${replaced ? '갱신' : '추가'}: 등록 기기 ${kept.length + 1}대`);
  await output(`count=${kept.length + 1}`);

  // 새로 등록한 기기로 확인 알림
  await sendPushTo(sub, { title: '🔔 알림이 등록되었습니다', body: '내일 아침부터 이 기기로 날씨 알림이 옵니다.' });
  console.log('확인 알림 전송 완료');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
