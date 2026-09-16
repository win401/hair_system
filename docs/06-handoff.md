# 핸드오프 문서

2026-09-17 기준 현재 상태 스냅샷. 다른 사람(또는 다른 세션)이 이어받을 때
필요한 정보를 한곳에 모아둔다. 값이 바뀌면 여기도 같이 갱신할 것.

## 한 줄 요약

셀카 + 모발 상태 설문 → AI로 헤어스타일 3종 미리보기 → 상담 카드 생성 →
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
- **모바일 반응형 미검증** — 데스크톱 Chrome 위주로만 확인했다.
- **fail-closed 합성 임계값이 너무 엄격할 수 있음** — 증명사진처럼 타이트한 크롭에서 "안전하지 않음" 거부가 뜬 적 있다. 원인 로깅(`console.error`)은 추가해뒀지만, 실제 수치를 보고 임계값을 조정하는 작업은 아직 안 했다 (재현하려면 Gemini 유료 호출 필요).
- **디자이너가 `demo-salon` 1명만 시딩되어 있음** — 실제 가족 파일럿을 시작하려면 `designers` 테이블에 사촌/이모/이모부 등을 추가해야 한다.
- **`docs/04-stylist-interview-survey.md`의 사전 인터뷰 설문은 게시만 되고 응답 대기 중** — 실제 응답이 들어오면 `AGENTS.md` 현장 피드백 섹션에 누적할 것.
- **비용**: Gemini 이미지 생성 1회(버튼 1클릭 = 1장) 약 $0.07. Render/Supabase는 현재 무료 티어로 충분.

## 참고 문서

- [`docs/README.md`](./README.md) — 전체 기획 문서 인덱스
- [`docs/05-mvp-implementation-plan.md`](./05-mvp-implementation-plan.md) — 구현 계획과 마일스톤별 진행 상황(M0~M6)
- [`../AGENTS.md`](../AGENTS.md) — Claude·Codex 작업 로그 (시간순, 가장 상세함)
