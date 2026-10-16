// 재시도가 들어간 fetch 래퍼. 최초 1회 + 재시도 2회 = 최대 3번 시도한다.

const RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 인증키 등 비밀값이 오류 메시지에 섞이지 않게 URL에서 쿼리를 뗀다. */
export function safeUrl(url) {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

export async function withRetry(fn, { retries = RETRIES, delayMs = RETRY_DELAY_MS, label = '요청' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`${label} 실패 (${attempt + 1}/${retries + 1}): ${err.message} → 재시도`);
        await sleep(delayMs);
      }
    }
  }
  throw new Error(`${label} 최종 실패: ${lastError.message}`);
}

/** URL을 GET 하고 JSON을 돌려준다. 재시도 포함. */
export async function fetchJson(url, label) {
  return withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} (${safeUrl(url)})`);
      try {
        return JSON.parse(text);
      } catch {
        // 인증키 오류 등은 JSON이 아닌 XML/문자열로 온다.
        throw new Error(`JSON이 아닌 응답: ${text.slice(0, 150).replace(/\s+/g, ' ')}`);
      }
    },
    { label },
  );
}
