// GitHub 이슈 본문의 암호화된 구독 → push-subscriptions.json 에 추가 (subscribe.yml 워크플로에서 실행)
// 이슈 본문 예: "... SUB:<base64url 암호문>"
// 누구나 자기 GitHub 계정으로 등록할 수 있다. 남용을 막기 위해 다른 계정은 1인당·전체 대수를 제한한다.
import { appendFile } from 'node:fs/promises';
import { decryptEntry, decryptSubscription, readSubsFile, writeSubsFile, entryBlob } from '../src/subs.js';
import { sendPushTo } from '../src/push.js';

export const MAX_PER_USER = 3; // 저장소 주인이 아닌 계정 1명당 최대 기기 수
export const MAX_TOTAL = 30; // 전체 최대 기기 수

const { ISSUE_BODY = '', ISSUE_AUTHOR = '', REPO_OWNER = '', SUB_ENC_PRIVATE_KEY } = process.env;
const output = (line) => (process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, line + '\n') : null);

async function main() {
  if (!SUB_ENC_PRIVATE_KEY) throw new Error('SUB_ENC_PRIVATE_KEY 가 없습니다.');
  const blob = ISSUE_BODY.match(/SUB:([A-Za-z0-9_-]+)/)?.[1];
  if (!blob) throw new Error('이슈 본문에서 구독 정보(SUB:...)를 찾지 못했습니다.');
  const { sub, loc } = decryptEntry(blob, SUB_ENC_PRIVATE_KEY); // 복호화·형식 검사에 실패하면 여기서 중단

  // 같은 기기(endpoint)가 이미 있으면 새 것으로 바꾼다 (개수는 늘지 않음)
  const list = await readSubsFile();
  const kept = list.filter((e) => {
    try { return decryptSubscription(entryBlob(e), SUB_ENC_PRIVATE_KEY).endpoint !== sub.endpoint; } catch { return false; }
  });
  const replaced = kept.length !== list.length;

  const isOwner = ISSUE_AUTHOR && ISSUE_AUTHOR === REPO_OWNER;
  if (!isOwner) {
    const mine = kept.filter((e) => typeof e === 'object' && e.by === ISSUE_AUTHOR).length;
    if (mine >= MAX_PER_USER) throw new Error(`한 계정당 최대 ${MAX_PER_USER}대까지 등록할 수 있습니다.`);
    if (kept.length >= MAX_TOTAL) throw new Error(`등록 가능한 기기 수(${MAX_TOTAL}대)를 모두 채웠습니다.`);
  }

  const entry = { blob, by: ISSUE_AUTHOR || 'unknown', at: new Date().toISOString().slice(0, 10) };
  await writeSubsFile([...kept, entry]);
  console.log(`구독 ${replaced ? '갱신' : '추가'} (${entry.by}): 등록 기기 ${kept.length + 1}대`);
  await output(`count=${kept.length + 1}`);

  // 새로 등록한 기기로 확인 알림
  const where = loc?.name ? `${loc.name} 날씨로 ` : '';
  await sendPushTo(sub, { title: '🔔 알림이 등록되었습니다', body: `내일 아침부터 이 기기로 ${where}알림이 옵니다. 1~2분 뒤 앱 화면도 이 위치로 바뀝니다.` });
  console.log('확인 알림 전송 완료');
}

main().catch(async (e) => {
  console.error(e.message);
  await output(`error=${e.message.replace(/\n/g, ' ')}`);
  process.exit(1);
});
