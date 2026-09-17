# 핸드오프 문서

2026-09-17 기준 현재 상태 스냅샷. 다른 사람(또는 다른 세션)이 이어받을 때
필요한 정보를 한곳에 모아둔다. 값이 바뀌면 여기도 같이 갱신할 것.

## 한 줄 요약

셀카 + 모발 상태 설문 → AI로 헤어스타일 정밀 미리보기 1장 → 상담 카드 생성 →
디자이너가 가능 여부 응답 → 네이버 예약으로 연결하는 남성 헤어 상담 MVP.
지금은 **링크를 아는 사람만 접근 가능한 상태로 실제 배포되어 있다.**

## 지금 살아있는 것들

| 구성 요소 | URL / 위치 | 비고 |
|---|---|---|
| 메인 앱 (Next.js, Vercel) | https://hairsystem-sigma.vercel.app | 링크 전용 게이트 있음 (아래 참고) |
| 소스 저장소 | https://github.com/win401/hair_system | public. 레퍼런스 사진은 제외됨 |
| 헤어 합성 서비스 (Python/FastAPI, Render) | https://hair-system.onrender.com | 무료 티어 — 비활성 시 슬립, 첫 요청 50초+ 걸릴 수 있음 |
| Supabase 프로젝트 | `hair-consult-mvp` (`rllpzvwzvvdpekadvvfo`), 서울 리전 | DB + Storage(selfies/generated/style-references) |
| Vercel 프로젝트 | `401s-projects-3a87049c/hair_system` | GitHub 연동, push해도 자동배포는 안 됨 (아래 배포 방법 참고) |

## 링크 전용 접근 제한

`proxy.ts`가 `SITE_ACCESS_TOKEN` 환경변수와 맞는 `?token=` 쿼리 또는 쿠키가
없으면 페이지는 `/invite-only`로, API는 401로 막는다. 실제 토큰 값은 이
문서(공개 저장소)에 적지 않는다 — Vercel 대시보드 · Render 필요 없음(이건
별개 앱) · 로컬 `.env.local`에서 확인할 것. 공유용 링크 형태:

```
https://hairsystem-sigma.vercel.app/?token=<SITE_ACCESS_TOKEN 값>
```

## 아키텍처

```
사용자 브라우저
   │
   ▼
Vercel (Next.js 16, App Router)  ──► Supabase Postgres (상담 카드, 디자이너)
   │                               ──► Supabase Storage (private: selfies, generated, style-references)
   │                               ──► Google Gemini API (gemini-3.1-flash-image, 이미지 생성)
   ▼
Render (FastAPI, Docker)
   └─ OpenCV: 원본 얼굴 보존 + 생성된 헤어만 합성 (fail-closed 안전장치 포함)
```

- Vercel의 Node.js 서버리스 함수는 Python/OpenCV를 못 돌려서, 합성만 Render에 별도 배포했다.
- `HAIR_COMPOSITOR_PROVIDER=http`(프로덕션) vs `python`(로컬 서브프로세스, 개발 편의용) 두 모드가 `lib/server/hair-compositor.ts`에 있다.
- `/api/generate`는 유료 Gemini 호출 전에 Render `/health`를 최대 75초 기다려 깨운다. 합성 요청 자체는 최대 90초, Vercel 함수는 `maxDuration=300`으로 설정했다. 콜드 스타트가 실패하면 Gemini를 호출하지 않아 이미지 생성 비용이 발생하지 않는다.
- AI 제공자(`HAIR_GENERATOR_PROVIDER`)와 추천 제공자(`HAIR_RECOMMENDER_PROVIDER`)는 각각 `mock`/`gemini`, `trend-curation`/`gemini`로 명시적 전환 — 키를 넣는 것만으로 실제 호출이 켜지지 않는다.

## 환경변수 (값은 각 플랫폼 대시보드 또는 로컬 `.env.local`에서 확인)

`.env.example`에 전체 목록과 설명이 있다. 요약:

| 변수 | 설정 위치 |
|---|---|
| `HAIR_GENERATOR_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` | Vercel (production+preview), 로컬 `.env.local` |
| `HAIR_COMPOSITOR_PROVIDER`, `HAIR_COMPOSITOR_SERVICE_URL`, `HAIR_COMPOSITOR_API_KEY` | Vercel + Render(서비스 쪽엔 `HAIR_COMPOSITOR_API_KEY`만) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Vercel, 로컬 `.env.local` |
| `SITE_ACCESS_TOKEN` | Vercel, 로컬 `.env.local` — 없으면 접근 게이트 자체가 비활성화됨 |
| `HAIR_RECOMMENDER_PROVIDER`, `GEMINI_TEXT_MODEL` | 선택. 기본값(`trend-curation`)이면 안 넣어도 됨 |

## 로컬에서 이어서 개발하기

```bash
git clone https://github.com/win401/hair_system.git
cd hair_system
npm install
cp .env.example .env.local   # 값은 팀원에게 따로 받을 것
npm run dev                  # http://localhost:3000
```

Python 합성기를 로컬에서 직접 돌리려면 (`HAIR_COMPOSITOR_PROVIDER=python`):

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

FastAPI 서버 자체를 로컬에서 띄워보려면(`python/server.py`):

```bash
./.venv/bin/pip install -r requirements-server.txt
HAIR_COMPOSITOR_API_KEY=test ./.venv/bin/python -m uvicorn python.server:app --port 8000
```

## 배포 방법

- **Render (합성 서비스)**: GitHub `main` 브랜치에 push하면 자동 재배포됨.
- **Vercel (메인 앱)**: **자동배포 아님.** `vercel login` 후 아래로 수동 배포:
  ```bash
  npx vercel deploy --prod
  ```
- **Supabase 마이그레이션**: `supabase/migrations/*.sql`을 프로젝트에 순서대로 적용 (MCP `apply_migration` 또는 Supabase 대시보드 SQL 에디터 사용). 로컬 Supabase CLI 연동은 아직 안 해놨다.

## 알려진 제약 / 다음에 볼 것 (M6 남은 일)

- **셀카 자동 삭제 없음** — 지금은 운영자가 Storage에서 수동으로 지워야 한다.
- **퍼널 이벤트 로깅 미완성** — `naver_clicked_at` 컬럼은 있지만 실제 클릭 시 기록하는 코드는 아직 안 붙였다.
- **실제 모바일 기기 검증 필요** — 로컬 Chrome 390px 뷰포트에서는 위저드·결과 화면을 확인했지만, 배포판을 iPhone Safari와 Android Chrome 실기기에서 아직 검증하지 않았다.
- **합성 최종 품질 검증 필요** — 과도하게 엄격했던 정렬 검사는 회전·확대·이동을 먼저 보정한 뒤 5개 얼굴 랜드마크 형태를 검사하도록 수정했다. 동일 인물 재프레이밍은 허용하고 다른 얼굴 레퍼런스는 차단하는 로컬 회귀를 통과했으나, 배포판에서 실제 Gemini 결과를 다시 생성해 헤어라인·halo·스타일 일치도를 확인해야 한다.
- **디자이너가 `demo-salon` 1명만 시딩되어 있음** — 실제 가족 파일럿을 시작하려면 `designers` 테이블에 사촌/이모/이모부 등을 추가해야 한다.
- **사전 인터뷰 설문 1건 수집** — 남성 커트·펌 중심 원장 응답을 `AGENTS.md` 현장 피드백에 기록했다. 표본이 1명뿐이므로 외부 디자이너 응답을 더 받아야 한다.
- **실시간 카메라 체험은 아직 미구현** — 생성형 AI를 매 프레임 호출하지 않고, 기기 내 얼굴 추적과 2D/3D 헤어 자산으로 탐색한 뒤 선택 장면만 정밀 AI 생성으로 보내는 하이브리드 안을 `docs/07-live-camera-ar-plan.md`에 정리했다.
- **비용**: Gemini 이미지 생성 1회(버튼 1클릭 = 1장) 약 $0.07. Render/Supabase는 현재 무료 티어로 충분.

## 참고 문서

- [`docs/README.md`](./README.md) — 전체 기획 문서 인덱스
- [`docs/05-mvp-implementation-plan.md`](./05-mvp-implementation-plan.md) — 구현 계획과 마일스톤별 진행 상황(M0~M6)
- [`docs/07-live-camera-ar-plan.md`](./07-live-camera-ar-plan.md) — 실시간 카메라 헤어 AR의 단계별 구현안
- [`../AGENTS.md`](../AGENTS.md) — Claude·Codex 작업 로그 (시간순, 가장 상세함)
