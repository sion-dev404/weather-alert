# weather-alert

기상청 단기예보 API로 아침 날씨를 정리해 텔레그램으로 보내는 프로젝트입니다.
(2단계: 주간 날씨는 추후 추가)

## 1. 키 설정

### 환경변수

| 이름 | 설명 |
|---|---|
| `KMA_SERVICE_KEY` | 공공데이터포털 인증키 (단기·중기 공용) |
| `NX`, `NY` | 단기예보 격자 좌표 |
| `TELEGRAM_BOT_TOKEN` | @BotFather 에서 발급한 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 알림 받을 채팅 ID |
| `MID_LAND_REG_ID`, `MID_TA_REG_ID` | 2단계(중기예보)에서 사용 |

로컬: `.env.example` 을 `.env` 로 복사해서 값을 채웁니다. (`.env` 는 `.gitignore` 에 포함)
GitHub: 저장소 **Settings → Secrets and variables → Actions** 에 같은 이름으로 등록합니다.

### 인증키 발급
1. [공공데이터포털](https://www.data.go.kr) 가입 후 **기상청_단기예보 ((구)_동네예보) 조회서비스** 활용 신청
   (2단계용으로 **기상청_중기예보 조회서비스** 도 신청)
2. 마이페이지에서 일반 인증키를 복사합니다. Encoding/Decoding 키 어느 쪽이든 동작합니다.
3. 승인 직후엔 몇 분~1시간 정도 `SERVICE KEY IS NOT REGISTERED` 오류가 날 수 있습니다.

### 텔레그램
1. @BotFather → `/newbot` 으로 봇을 만들고 토큰을 받습니다.
2. 만든 봇에게 아무 메시지나 보냅니다.
3. 브라우저에서 `https://api.telegram.org/bot<토큰>/getUpdates` 를 열어 `chat.id` 를 확인합니다.

## 2. 지역코드 찾는 방법

- **NX, NY (격자 좌표)**: 공공데이터포털 단기예보 서비스 페이지의 *참고문서*에 있는
  `기상청41_단기예보 조회서비스_오픈API활용가이드` 엑셀의 **격자_위경도** 시트에서 시/구/동으로 검색합니다.
  (예: 서울 종로구 → 60, 127)
- **중기 지역코드** (2단계): 같은 가이드 문서 *중기예보 지역코드* 시트에서 확인합니다.

## 3. 실행

```bash
npm run dry    # 전송 없이 메시지만 출력
npm run send   # 실제 텔레그램 전송
npm test       # 단위 테스트
```

GitHub Actions(`.github/workflows/weather.yml`)가 매일 KST 06:30 에 실행하며, Actions 탭에서 수동 실행도 가능합니다.
(cron 은 UTC 기준이라 `30 21 * * *` 로 설정되어 있습니다. GitHub 사정으로 수 분~수십 분 지연될 수 있습니다.)

## 동작 메모
- 06:30 실행 시 최신 발표분은 05시 분이며, 오늘 최저기온(TMN)은 02시 발표분에만 있어 함께 조회합니다.
- API 실패 시 2회 재시도하고, 최종 실패하면 텔레그램으로 실패 알림을 보냅니다.
- 발표 시각 계산은 `src/kst.js` 에 KST 기준으로 분리되어 있습니다.
