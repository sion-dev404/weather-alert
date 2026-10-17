// GitHub 이슈 본문의 위치 JSON → location.json 저장 (location.yml 워크플로에서 실행)
// 이슈 본문 예: {"NX":63,"NY":124,"LOCATION_NAME":"중앙동"}
import { writeFile, appendFile } from 'node:fs/promises';
import { validateLocation } from '../src/location.js';

const body = process.env.ISSUE_BODY ?? '';
const match = body.match(/\{[^{}]*\}/);
if (!match) {
  console.error('이슈 본문에서 위치 JSON 을 찾지 못했습니다.');
  process.exit(1);
}

let loc;
try {
  loc = validateLocation(JSON.parse(match[0]));
} catch (e) {
  console.error(`위치 값 오류: ${e.message}`);
  process.exit(1);
}

await writeFile('location.json', JSON.stringify(loc, null, 2) + '\n', 'utf8');
console.log(`location.json 갱신: ${loc.name || '(이름 자동 조회)'} (격자 ${loc.nx}, ${loc.ny})`);
// 다음 단계(커밋 메시지·이슈 댓글)에서 쓸 값
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `name=${loc.name || '자동 조회'}\n`);
}
