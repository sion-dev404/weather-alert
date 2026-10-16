import { withRetry } from './http.js';

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 환경변수가 없습니다.');

  return withRetry(
    async () => {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        // 토큰이 URL에 들어 있으므로 URL은 오류 메시지에 넣지 않는다.
        const body = await res.text();
        throw new Error(`텔레그램 HTTP ${res.status}: ${body.slice(0, 150)}`);
      }
    },
    { label: '텔레그램 전송' },
  );
}
