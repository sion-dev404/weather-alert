# weather-alert

기상청 단기·중기예보 API로 날씨를 정리해 GitHub Pages 웹 화면에 보여 주고,
매일 아침 웹 푸시로 알림을 보내는 프로젝트입니다.

- 페이지: https://sion-dev404.github.io/weather-alert/

## 1. 키 설정

### 환경변수

| 이름 | 설명 |
|---|---|
| `KMA_SERVICE_KEY` | 공공데이터포털 인증키 (단기·중기 공용) |
| `NX`, `NY` | 단기예보 격자 좌표 |
| `LOCATION_NAME` | 화면·알림에 표시할 지역명 (GitHub 에서는 Variables 에 등록) |
| `MID_LAND_REG_ID`, `MID_TA_REG_ID` | 중기예보 지역코드 (주간 날씨) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | 웹 푸시 VAPID 키 쌍 |
| `PUSH_SUBSCRIPTION` | 알림 받을 기기의 구독 정보 (JSON, 여러 기기면 배열) |

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
2. **테스트 알림** 으로 알림이 뜨는지 확인합니다.
3. **구독 정보 복사** 후 Secret `PUSH_SUBSCRIPTION` 에 저장합니다.
   여러 기기에서 받으려면 `[{...}, {...}]` 처럼 배열로 넣습니다.
4. 알림이 오지 않고 Actions 로그에 `404`/`410` 이 보이면 구독이 만료된 것이니 1~3을 다시 합니다.

VAPID 키 쌍은 처음 한 번만 만듭니다. 바꾸면 기존 구독은 모두 다시 해야 하고,
`site/index.html` 의 `VAPID_PUBLIC_KEY` 도 같이 바꿔야 합니다.

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
