# weather-alert

기상청 단기·중기예보 API로 날씨를 정리해 GitHub Pages 웹 화면에 보여 주고,
매일 아침 웹 푸시로 알림을 보내는 프로젝트입니다.

- 페이지: https://sion-dev404.github.io/weather-alert/

## 1. 키 설정

### 환경변수

| 이름 | 설명 |
|---|---|
| `KMA_SERVICE_KEY` | 공공데이터포털 인증키 (단기·중기 공용) |
| `NX`, `NY` | 단기예보 격자 좌표 (`location.json` 이 없을 때만 사용) |
| `LOCATION_NAME` | 지역명 (`location.json` 이 없을 때만 사용, 비면 자동 조회) |
| `MID_LAND_REG_ID`, `MID_TA_REG_ID` | 중기예보 지역코드 (주간 날씨) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | 웹 푸시 VAPID 키 쌍 |
| `SUB_ENC_PRIVATE_KEY` | 알림 구독 암호문을 푸는 개인키 (공개키는 `site/index.html` 의 `SUB_ENC_PUBLIC_KEY`) |
| `PUSH_SUBSCRIPTION` | (예전 방식, 선택) 평문 구독 JSON. 지금은 `push-subscriptions.json` 을 사용 |

### 위치 바꾸기 (`location.json`)
날씨 기준 위치는 저장소의 `location.json` (`{"nx", "ny", "name"}`) 에 있습니다.
1. 페이지 왼쪽 위 **지역명** 을 누르고 위치 권한을 허용합니다.
2. 기준 위치와 다르면 **이 위치로 바꾸기** → GitHub 이슈 작성 화면에서 **Create** 를 누릅니다.
3. `location.yml` 이 값을 검사해 `location.json` 을 커밋하고, 페이지를 다시 배포한 뒤 이슈를 닫습니다 (2~3분).
   저장소 주인이 쓴, 제목이 "위치 변경"으로 시작하는 이슈만 처리합니다.

로컬: `.env.example` 을 `.env` 로 복사해서 값을 채웁니다. (`.env` 는 `.gitignore` 에 포함)
GitHub: 저장소 **Settings → Secrets and variables → Actions** 에 같은 이름으로 등록합니다.

### 인증키 발급
1. [공공데이터포털](https://www.data.go.kr) 가입 후 **기상청_단기예보 ((구)_동네예보) 조회서비스**,
   **기상청_중기예보 조회서비스** 활용 신청
2. 마이페이지에서 일반 인증키를 복사합니다. Encoding/Decoding 키 어느 쪽이든 동작합니다.
3. 승인 직후엔 몇 분~1시간 정도 `SERVICE KEY IS NOT REGISTERED` 오류가 날 수 있습니다.

### 웹 푸시 알림 켜기
1. 페이지 아래쪽 **아침 알림 설정하기** 를 누르고 알림을 허용합니다.
   (아이폰은 Safari 공유 → **홈 화면에 추가** 후, 홈 화면 아이콘으로 열어야 합니다.)
2. **이 기기 알림 등록하기** → GitHub 이슈 작성 화면에서 **Create** 를 누릅니다.
3. `subscribe.yml` 이 구독을 `push-subscriptions.json` 에 추가·커밋하고, 그 기기로 "알림이 등록되었습니다" 알림을 보낸 뒤 이슈를 닫습니다.
   제목이 "알림 등록"으로 시작하는 이슈면 **누구의 GitHub 계정이든** 처리합니다 (가족·친구도 자기 계정으로 등록 가능).
   남용 방지: 주인이 아닌 계정은 1인당 3대, 전체 30대까지. 목록에는 등록한 계정(`by`)이 함께 남습니다.
   처리되지 않은 이슈는 다시 열면(reopen) 다시 처리합니다. (위치 변경은 계속 저장소 주인만 가능)
4. 기기마다 한 번만 하면 됩니다. 앱 삭제·사이트 데이터 삭제로 구독이 만료되면(404/410)
   아침 알림을 보낼 때 목록에서 자동으로 지워지니, 그 기기에서 1~2를 다시 하면 됩니다.

### 아침 알림 조건
매일 KST 06:30 에 확인해서, 그 동네가 아래 중 하나일 때만 보낸다 (기준 숫자: `src/summary.js` 의 `ALERT`).
- 매우 더움: 최고기온 33°C 이상 / 매우 추움: 최저기온 -5°C 이하 또는 최고기온 0°C 이하
- 비·눈: 오늘 예보에 비·비/눈·눈·소나기가 있음

시험할 때는 Actions → Morning Weather → Run workflow 에서 **조건과 관계없이 보내기** 를 켜거나,
로컬에서 `node --env-file=.env send-weather.js --dry-run --always` 로 문구를 확인한다.

### 사람(기기)마다 다른 동네 날씨
- 등록할 때 그 기기의 위치(격자·동 이름)와 무작위 기기 ID 를 구독과 함께 암호화해 보낸다.
- 화면: `pages.yml` 이 3시간마다 기기별 날씨 파일 `site/w/<기기ID>.json` 을 만들고, 페이지는 이 기기 ID 의 파일을 먼저 읽는다
  (없으면 기본 위치 `weather.json`). 파일 이름이 무작위라 누가 어디 사는지 알 수 없다.
- 아침 알림: 기기를 격자별로 묶어 동네마다 한 번씩 예보를 조회하고, 각 기기에 자기 동네 이름으로 보낸다.
- 주간 예보: 가장 가까운 대표 도시(29곳, `src/midregion.js`)의 중기예보 코드를 쓴다.
- 위치를 바꾸려면 페이지 위쪽 지역명 → **이 위치로 바꾸기** (기기 다시 등록). 위치 없이 등록된 기기는 기본 위치 날씨.

공개 저장소라 구독 정보는 브라우저에서 암호화(ECDH P-256 + HKDF + AES-GCM)해서 올리고,
이슈와 `push-subscriptions.json` 에는 암호문만 남습니다. 복호화는 Secret `SUB_ENC_PRIVATE_KEY` 로 Actions 에서만 합니다.

VAPID 키 쌍과 구독 암호화 키 쌍은 처음 한 번만 만듭니다. 바꾸면 기존 구독은 모두 다시 해야 하고,
`site/index.html` 의 `VAPID_PUBLIC_KEY` / `SUB_ENC_PUBLIC_KEY` 도 같이 바꿔야 합니다.

## 2. 지역코드 찾는 방법

- **NX, NY (격자 좌표)**: 공공데이터포털 단기예보 서비스 페이지의 *참고문서*에 있는
  `기상청41_단기예보 조회서비스_오픈API활용가이드` 엑셀의 **격자_위경도** 시트에서 시/구/동으로 검색합니다.
  (예: 서울 종로구 → 60, 127)
- **중기 지역코드**: 같은 가이드 문서 *중기예보 지역코드* 시트에서 확인합니다.
  (`L` 로 시작하는 코드는 기상특보 구역코드라 쓰지 않습니다.)

## 3. 실행

```bash
npm install    # web-push 설치
npm run dry    # 전송 없이 알림 문구만 출력
npm run send   # 실제 웹 푸시 전송
npm test       # 단위 테스트
node --env-file-if-exists=.env build-site.js   # site/weather.json 생성
```

GitHub Actions
- `weather.yml`: 매일 KST 06:30 웹 푸시 알림 (cron `30 21 * * *`, UTC 기준). 수동 실행 가능.
- `pages.yml`: 3시간마다, 그리고 화면 코드 push 시 `weather.json` 을 만들어 Pages 에 배포.
- GitHub 사정으로 예약 실행이 수 분~수십 분 늦어질 수 있습니다.

## 동작 메모
- 06:30 실행 시 최신 발표분은 05시 분이며, 오늘 최저기온(TMN)은 02시 발표분에만 있어 함께 조회합니다.
- API 실패 시 2회 재시도하고, 최종 실패하면 웹 푸시로 실패 알림을 보냅니다.
- 발표 시각 계산은 `src/kst.js` 에 KST 기준으로 분리되어 있습니다.
