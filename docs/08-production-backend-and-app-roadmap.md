# 실서비스 백엔드·앱 출시 로드맵

## 결론

실제 서비스라고 해서 백엔드를 Java·Go 같은 다른 언어로 다시 만들 필요는 없다.
현재의 **Next.js/TypeScript + Python/FastAPI + Supabase** 조합은 충분히 정상적인
프로덕션 구성이다. 언어보다 먼저 해결해야 할 것은 작업 상태, 재시도, 사진 보관
기간, 접근 제어, 모니터링과 비용 제한이다.

1인 사업 기준 권장 순서는 다음과 같다.

1. 모바일 웹에서 카메라 AR과 정밀 생성의 사용성을 검증한다.
2. 유료 호출과 사용자 수가 늘면 Python 합성기를 무료 Render에서 상시 운영 가능한
   컨테이너 서비스로 옮기고 비동기 작업 큐를 붙인다.
3. 반복 사용과 앱 설치 수요가 확인된 뒤 React Native/Expo 앱을 만든다.
4. 여러 각도 헤어 AR의 사용률이 검증된 경우에만 3D 자산과 네이티브 렌더링에
   투자한다.

## 권장 프로덕션 구조

```text
웹 / React Native 앱
        │
        ▼
Next.js TypeScript API (인증, 설문, 카드, 결제, 작업 접수)
        │
        ├── Supabase Postgres (사용자, 작업 상태, 상담 카드)
        ├── Supabase private Storage (원본, 결과, 만료 시각)
        ├── 작업 큐 (생성 요청, 재시도, 중복 방지)
        └── Python/FastAPI worker (OpenCV·얼굴 파싱·품질 검사)
                         │
                         └── Gemini 이미지 생성 API
```

### 언어별 역할

- **TypeScript/Next.js**: 로그인, 요청 검증, 디자이너·상담 카드, 결제, 작업 접수,
  결과 조회에 유지한다.
- **Python/FastAPI**: OpenCV, 얼굴 파싱, 합성 품질 검사처럼 Python 생태계가 강한
  작업만 담당한다.
- 두 서비스를 합쳐 한 언어로 통일하는 리라이트는 현재 이점보다 장애 위험이 크다.

## MVP에서 실제 서비스로 갈 때 추가할 것

### 1. 이미지 생성을 비동기 작업으로 전환

지금처럼 브라우저가 Gemini와 Python 합성이 끝날 때까지 한 HTTP 요청을 기다리는
구조는 초기 데모에는 단순하지만, 모바일 네트워크 단절과 재요청에 약하다.

- `generation_jobs` 테이블: `queued / generating / compositing / complete / failed`
- 클라이언트가 요청하면 즉시 `jobId`를 반환
- 같은 입력의 중복 결제를 막는 idempotency key
- worker 재시도 횟수와 실패 사유 저장
- 화면은 polling 또는 realtime subscription으로 상태 갱신
- 실패하면 재시도 또는 비용 복구 여부를 운영 화면에 표시

### 2. Python 서비스를 유료 상시 인프라로 이동

가족 파일럿까지는 현재 Render를 유지할 수 있다. 외부 사용자를 받기 전에는 최소
인스턴스를 둘 수 있는 Cloud Run 같은 컨테이너 서비스나 Render 유료 플랜으로
옮긴다. Cloud Run은 최소 인스턴스로 콜드스타트를 줄일 수 있고 요청 제한시간을
최대 60분까지 설정할 수 있지만, 긴 요청일수록 재연결·중복 실행을 고려한 설계가
필요하다.

- [Cloud Run 자동 확장과 최소 인스턴스](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Cloud Run 요청 제한시간](https://docs.cloud.google.com/run/docs/configuring/request-timeout)

### 3. 사진 보안과 삭제를 기능으로 만든다

- 버킷은 계속 private으로 유지하고 짧은 만료시간의 signed URL만 발급
- 사용자별 소유권과 작업별 경로를 RLS로 제한
- 원본 셀카 기본 보관기간을 24시간 또는 7일로 명시
- 상담 카드를 만들지 않은 임시 사진은 자동 삭제
- 사용자가 결과·원본·계정을 직접 삭제할 수 있는 화면 제공
- 운영 로그에 base64 사진, signed URL, API 키를 남기지 않음

Supabase Storage는 Postgres RLS로 객체 접근 정책을 제어할 수 있고 private 객체는
시간 제한 signed URL로 제공할 수 있다.

- [Supabase Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase signed URL](https://supabase.com/docs/guides/storage/serving/downloads)

### 4. 운영 관측과 비용 제한

- 생성 성공률, 단계별 지연시간, Gemini 비용, Python 실패 사유 집계
- 사용자·IP·기기별 생성 횟수 제한
- 관리자 화면에서 작업 재시도, 삭제, 디자이너 응답 확인
- 오류 추적 서비스와 uptime 확인
- Gemini·스토리지 월 예산 경보

## 앱 출시 방향

### 1단계 — 모바일 웹을 먼저 유지

현재 카메라 기술 스파이크는 HTTPS 웹에서도 동작한다. 설치 없이 가족·외부
디자이너 링크로 배포할 수 있어 제품 가설 검증에 가장 빠르다. 다음 지표가 나오기
전에는 앱 개발을 시작하지 않는다.

- 재방문 사용자 30명 이상
- 카메라 체험→캡처 전환 25% 이상
- 캡처→정밀 생성 전환 20% 이상
- 디자이너 5명 이상이 상담 카드가 실제 상담에 도움이 된다고 평가

### 2단계 — React Native/Expo 앱

앱 수요가 확인되면 단순 WebView 포장이 아니라 React Native/Expo로 카메라 화면과
핵심 탐색 UI를 네이티브로 만든다. Expo Camera는 iOS·Android·Web에서 전후면
카메라 미리보기와 촬영을 지원한다. 기존 Supabase와 Next.js API는 그대로 사용하고,
TypeScript 타입과 검증 스키마 일부는 공유할 수 있다.

- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)

초기 앱 범위:

- 카메라 AR, 사진 촬영, 스타일 즐겨찾기
- 정밀 생성 작업 상태와 결과 알림
- 이전 결과·상담 카드 보관함
- 디자이너 공유와 네이버 예약 딥링크
- 사진·계정 삭제, 개인정보 처리방침

### 3단계 — 고품질 3D AR

2D 필터 사용 데이터가 충분할 때만 아이비리그 한 종의 GLB 헤어 자산을 제작한다.
머리 자세 추적, 두상 크기 보정, 귀·얼굴 occlusion과 색상·조명 보정이 필요하다.
React Native에서 성능이 부족하면 카메라/렌더링 화면만 네이티브 모듈 또는 Unity로
분리하고 나머지 앱은 React Native로 유지한다.

## 앱스토어 출시 주의점

- iOS 앱은 웹사이트를 단순 포장한 수준보다 앱다운 지속적 가치가 필요하다. 카메라
  AR, 결과 보관함, 알림과 상담 흐름이 앱 심사의 핵심 기능이 되어야 한다.
- 카메라 기록에는 명확한 사용자 동의와 시각적 표시가 필요하다.
- 개인정보 처리방침에는 수집 데이터, 제3자(Gemini·Supabase) 제공, 보관기간,
  동의 철회와 삭제 방법을 적는다.
- 베타는 App Store 본심사보다 TestFlight와 비공개 Google Play 테스트로 먼저
  검증한다.

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play 대상 API 요구사항](https://developer.android.com/google/play/requirements/target-sdk)

## 지금의 결정

- 카메라 AR은 웹 베타로 계속 개발한다.
- 프로덕션 백엔드 언어는 바꾸지 않는다.
- 외부 공개 직전에 Python 서비스를 상시 인스턴스로 옮기고 작업 큐·자동 삭제를
  구현한다.
- 네이티브 앱은 사용성 지표가 확인된 뒤 Expo로 시작한다.
- 3D 자산 제작은 아이비리그 2D 필터의 실제 전환율을 확인한 뒤 결정한다.
