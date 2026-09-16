# AI 헤어스타일 시뮬레이션 MVP — 구현 계획

## Context

`docs/`에 정리된 기획(01~03)과 `AGENTS.md`(Claude·Codex 협업 로그)를 거쳐, "인터뷰부터 시작"이 아니라 **"제대로 된 MVP를 먼저 만들어서 보여주는" 방향으로 전환**하기로 사용자가 결정했다. 사촌이 실제로 오픈한 매장이 있고 이모·이모부도 업계 종사자라, 완성된 데모를 가족 파일럿 파트너에게 바로 보여줄 수 있다는 게 이 전환의 근거다.

참고로 Codex가 최근 `docs/04-stylist-interview-survey.md`(가족 종사자 사전 인터뷰용 구글 설문 설계)를 추가했는데, 이건 **아직 실시되지 않은 설문지 초안**이다. 여기 담긴 "카카오톡 알림 정도만 가능" 같은 문구는 확정된 현장 제약이 아니라 응답 보기 중 하나일 뿐이므로, 이 계획에서는 참고 신호로만 쓰고 확정 사실로 취급하지 않는다.

사용자가 이미 확정한 것:
- 기술 스택: **Next.js (App Router, TS) + Vercel**
- AI 이미지 생성: **Gemini 3.1 Flash Image** — 얼굴·구도 일관성을 우선해 상위 이미지 모델로 전환했다. 로컬 Gemini 모드는 활성화되어 있으며, 사용자가 생성 확인 버튼을 눌렀을 때만 1장을 호출한다.
- 데이터 저장소: **Supabase** (Vercel 서버리스에서 바로 동작, 무료 티어로 충분)
- MVP 범위: **사용자 플로우 + 디자이너 응답 화면까지** (자체 예약/결제, 실시간 채팅, 앱, AR, 디자이너 CRM/대시보드, 로그인 시스템은 제외)

목표: 셀카 업로드 → 헤어 설문 → 스타일 선택 → AI 정밀 시뮬레이션 1장 → 상담 카드 생성 → 디자이너가 링크로 열어 가능/조건부/어려움 응답 → 사용자에게 네이버 예약 링크 노출. 이 전체 루프가 Gemini 키 없이도 목업으로 끝까지 클릭 가능해야 하고, 키가 생기면 라우트/UI 변경 없이 실제 생성으로 교체 가능해야 한다.

## 접근 방식

### 프로젝트 구조

```
app/
  page.tsx                          # 랜딩
  (user)/
    layout.tsx                      # 위저드 상태(Context) 래퍼
    start/[designerSlug]/page.tsx   # 셀카 업로드 + 헤어 설문 (디자이너별 진입 링크)
    style/page.tsx                  # 스타일 선택
    generate/page.tsx               # 생성 중 → 결과 화면
    card/[slug]/page.tsx            # 상담 카드 (사용자용, 공유 가능한 slug)
  designer/respond/[token]/page.tsx # 디자이너 응답 화면 (별도 고엔트로피 token, 비로그인)
  api/
    generate/route.ts               # 셀카+스타일+설문 → GeneratedImage[]
    cards/route.ts                  # 카드 생성 (POST)
    cards/[slug]/route.ts           # 카드 조회 (GET)
    cards/[slug]/naver-click/route.ts # 네이버 예약 클릭 로깅
    designer-cards/[token]/route.ts # 디자이너용 조회(GET) + 응답 저장(PATCH)
lib/
  ai/{types.ts,adapter.ts,mock-adapter.ts,gemini-adapter.ts}
  supabase/{server.ts,storage.ts}
  styles.ts                         # 7개 한국형 스타일 고정 목록
  slug.ts                           # 공개 slug / 디자이너 token 생성
  validation.ts                     # zod 스키마
supabase/migrations/0001_init.sql
public/mock/                        # 목업 어댑터용 샘플 이미지
```

위저드 상태는 `card` 생성 전까지 Supabase에 쓰지 않는다. 리사이즈된 셀카는 브라우저 IndexedDB에, 동의·설문·선택 스타일 등 가벼운 상태는 `localStorage`에 두어 재방문 시 복원하며, 사용자의 사진 삭제·동의 철회·전체 초기화로 함께 제거한다. 중간 이탈로 인한 쓰레기 row와 불필요한 서버 사진 저장을 막기 위한 구조다.

### 데이터 모델 (Supabase)

```sql
create table designers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  naver_booking_url text not null,
  created_at timestamptz not null default now()
);

create table consultation_cards (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                    -- 사용자 공유 링크
  designer_response_token text unique not null, -- 디자이너 전용 별도 token
  designer_id uuid not null references designers(id),

  selfie_storage_path text,
  selfie_deleted_at timestamptz,
  survey jsonb not null,                        -- {currentLength, textureCurl, damageLevel}
  requested_style_id text not null,              -- lib/styles.ts 참조 (테이블 아님)

  generation_status text not null default 'pending'
    check (generation_status in ('pending','pending_review','succeeded','failed')),
  generation_error text,
  generated_images jsonb not null default '[]',  -- [{storagePath, isMock, provider}]

  status text not null default 'pending'
    check (status in ('pending','designer_responded')),
  designer_verdict text check (designer_verdict in ('possible','conditional','difficult')),
  designer_notes text,
  designer_responded_at timestamptz,

  naver_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- **RLS는 켜두되 anon/authenticated에 정책을 주지 않는다.** 모든 읽기/쓰기는 서버 라우트가 service-role 키로 수행하고, 보안은 `slug`/`designer_response_token`의 추측 불가능성으로 확보한다(계정 시스템 없음과 일관).
- **운영자 검수 단계(`pending_review`)를 스키마에 포함시킨다.** 문서(`03-launch-simulation.md`)가 "초기에는 생성 결과를 운영자가 검수한다"고 명시했고, 가족 파일럿 첫 데모에서 이상한 결과가 그대로 나가면 신뢰를 깎을 수 있어 비용 대비 넣을 가치가 있다고 판단. M4에서 최소한의 승인 화면(또는 Supabase Studio에서 status만 바꾸는 수동 운영)으로 구현.
- 스타일 목록은 테이블화하지 않고 `lib/styles.ts`의 남성 커트·펌 7종 고정 배열로 시작한다. 아이비리그컷은 클래식과 스파이키를 별도 선택지로 둔다. 첫 검증은 대표자가 직접 체험할 수 있는 남성 헤어에 집중하고, 디자이너별 전문 분야가 갈리면 나중에 테이블로 승격한다.

### AI 생성 어댑터 (키 없이도 동작)

```ts
// lib/ai/types.ts
interface HairSurveyAnswers { currentLength: 'short'|'medium'|'long'; textureCurl: 'straight'|'wavy'|'curly'; damageLevel: 'low'|'medium'|'high' }
interface GenerateHairstyleInput { selfieBuffer: Buffer; styleId: string; survey: HairSurveyAnswers; variantCount?: number }
interface GeneratedImage { buffer: Buffer; isMock: boolean; provider: 'mock' | 'gemini-image' }
interface HairstyleGenerator { generateHairstyle(input: GenerateHairstyleInput): Promise<GeneratedImage[]> }

// lib/ai/adapter.ts
export function getHairstyleGenerator(): HairstyleGenerator {
  return process.env.HAIR_GENERATOR_PROVIDER === 'gemini'
    ? new GeminiHairstyleGenerator(...)
    : new MockHairstyleGenerator();
}
```

- `HAIR_GENERATOR_PROVIDER`의 기본값은 `mock`이다. 키를 추가하는 것만으로 미구현 어댑터가 켜지지 않으며, `gemini`를 명시했는데 키가 없으면 서버가 명확한 설정 오류를 반환한다.
- 서버 컴포넌트가 키 존재 여부를 서버에서 읽어 `isMockMode` boolean만 클라이언트로 내려주고, `MockModeBanner`가 "체험용 샘플 이미지" 배지를 표시.
- 실제 어댑터의 런타임 오류(네트워크/쿼터/malformed response)는 `/api/generate`에서 잡아 `generation_status='failed'` + `generation_error`로 기록, 500이 아니라 재시도 UI로 노출.
- 목업 어댑터는 원본 셀카 또는 `public/mock/` 샘플을 `isMock:true`로 반환 — 이미지 처리 의존성 추가 없이 가장 빠른 경로.

### 이미지 저장

**Supabase Storage 버킷 2개 (`selfies`, `generated`), base64 인라인 저장 아님.**
- 둘 다 private, 서버가 필요할 때만 signed URL 발급.
- 근거: base64는 row를 비대하게 만들고 CDN 캐싱을 못 쓰며, 특히 "셀카는 삭제 가능해야 한다"(01번 문서 개인정보 요구사항)는 요건과 상충 — Storage는 상담 카드(설문/디자이너 응답)는 남기고 사진만 지우는 게 깔끔하다.
- MVP는 **수동 삭제**만 지원(운영자가 스크립트/SQL로 Storage 객체 삭제 + `selfie_deleted_at` 기록). 자동 TTL 삭제(Vercel Cron)는 후속 작업으로 명시적으로 미룬다 — 문서가 요구하는 기능이지만 엔지니어링 우선순위는 낮음.
- 업로드 전 클라이언트에서 ~1024px로 리사이즈 + `variantCount` 1장 고정 — 세 장의 유사 결과보다 한 장의 합성 품질을 먼저 검증하고 Gemini 비용과 Storage 사용량을 줄인다.

### 빌드 순서

| # | 마일스톤 | 범위 | 데모 가능 시점 |
|---|---|---|---|
| M0 | 스캐폴드 | create-next-app, Tailwind, shadcn/ui, 랜딩, git init, Vercel 연결 | 배포된 "hello world" |
| M1 | 정적 위저드 UI | 스타일 목록, 업로드+설문 폼(zod+react-hook-form), 스타일 픽커, 위저드 상태 — 백엔드 없음 | 랜딩→업로드→설문→스타일선택→"생성중" 클릭스루 |
| M2 | 목업 생성 E2E | `lib/ai/*`(목업만), `/api/generate`, 결과 화면(목업 이미지+배지) — 카드는 아직 in-memory | **Supabase/키 없이 완전히 클릭 가능한 최초 데모** — 가족에게 가장 먼저 보여줄 수 있는 버전 |
| M3 | Supabase 연동 | 프로젝트 생성, 마이그레이션, Storage 버킷, `/api/cards` 영속화, `/card/[slug]` 실제 DB 조회 | 새로고침/다른 기기에서도 살아있는 카드 링크 |
| M4 | 디자이너 응답 플로우 | `/designer/respond/[token]`, PATCH 라우트, 운영자 검수(`pending_review`) 처리, 디자이너 1~2명 수동 시딩 | **전체 제품 루프 완성** (목업 이미지 기준) — 실사용 가족 파일럿을 이 버전으로 시작 가능 |
| M5 | 실제 Gemini 연동 | `gemini-adapter.ts`, 제공자를 `gemini`로 명시하면 전환, 프롬프트 튜닝 | 라우트/UI 변경 없이 실제 AI로 교체 |
| M6 | 프라이버시·QA 마무리 | 수동 삭제 경로, 퍼널 이벤트(`naver_clicked_at`), 모바일 반응형, 로딩/에러 상태 | 문서의 "공개 조건" 지표에 맞춘 파일럿용 빌드 |

M2를 가장 빠른 데모 지점으로 잡은 이유: 계정/키가 전혀 없어도 도달 가능해서 지금 바로 시작할 수 있다. M5(실제 Gemini)는 의도적으로 마지막 — 키가 없어도 나머지 전부가 막히지 않아야 한다는 요구사항과 맞물린다.

### 확정한 세부 결정 (더 이상 열어두지 않음)

- 카드는 항상 특정 디자이너의 진입 링크(`/start/[designerSlug]`)를 통해 생성됨 — `designer_id NOT NULL`. (성장전략 문서의 "개인용 AI 상담 링크" 모델과 일치)
- `designer_response_token`은 재제출 허용(디자이너가 응답을 나중에 수정 가능) — 파일럿 규모(2~5명)에서 남용 위험이 낮아 단순함을 우선.
- 디자이너가 자기 카드 링크를 받는 방법: 자동 알림 파이프라인 없이, **운영자(=사용자 본인)가 카카오톡으로 링크를 수동 전달**. 자동화는 지금 만들지 않는다.

### 남는 열린 질문 (계획에 포함하되 사용자 확인 필요)

- 스타일 목록을 디자이너별로 다르게 보여줘야 할지는 04번 설문(아직 미실시) 결과가 나온 뒤 재검토.
- Gemini API 키와 실제 어댑터가 준비되어 로컬은 `gemini` 모드로 동작한다. 새로고침·화면 진입으로는 호출하지 않고 생성 확인 버튼과 명시적 재시도에서만 비용이 발생한다.

## 검증 방법

- M1~M2: `npm run dev`로 로컬에서 전체 위저드를 브라우저로 직접 클릭스루 (업로드 → 설문 → 스타일 → 목업 결과 화면까지 콘솔 에러 없이 도달하는지 확인).
- M3: Supabase MCP 도구로 마이그레이션 적용 후 `list_tables`/`execute_sql`로 스키마 확인, 카드 생성 API를 `curl`로 호출해 row가 실제로 쌓이는지 확인.
- M4: 상담 카드 slug와 디자이너 token을 각각 다른 브라우저 탭/시크릿창으로 열어, 디자이너가 응답하면 사용자 카드 화면에 반영되는지 확인.
- M5(키 확보 후): `.env`에 `HAIR_GENERATOR_PROVIDER=gemini`와 `GEMINI_API_KEY` 추가 → 재시작 후 목업 배지가 사라지고 실제 생성 이미지가 나오는지 확인, 실패 케이스(잘못된 키)도 `generation_status='failed'`로 깨지지 않고 처리되는지 확인.
- 매 마일스톤 끝에 `npm run build`로 타입 에러/빌드 실패 여부 확인 후 Vercel 배포.

## 진행 상황

- [x] M0 스캐폴드 (2026-09-16, Claude) — Next.js 16 / React 19 / Tailwind v4로 생성
- [x] M1 정적 위저드 UI (2026-09-16, Claude) — `/start/[designerSlug]` → `/style` → `/generate`, react-hook-form + zod, 클라이언트 리사이즈(lib/image.ts)
- [x] M2 목업 생성 E2E (2026-09-16, Claude) — `lib/ai/*` 어댑터, `/api/generate`, 목업 배지 UI. 브라우저로 전체 클릭스루 검증 완료
- [x] M2 안정화 (2026-09-16, Codex) — 남성 스타일 6종으로 범위 축소, 위저드 상태 유실 수정, 사진 동의·삭제·전체 초기화, 생성 API 이미지·스타일 검증, 명시적 AI 제공자 전환
- [x] M3 Supabase 연동 (2026-09-16, Codex) — Seoul 리전 프로젝트, private
  `selfies`/`generated` 버킷, 카드·디자이너 스키마와 서버 전용 API를 연결했다.
  `/api/cards`로 이미지와 설문을 저장하고 `/card/[slug]`에서 signed URL로 조회한다.
- [x] M4 디자이너 응답 플로우 (2026-09-16, Claude) — `/designer/respond/[token]`
  페이지(고객 원본 사진·설문·결과 3장 표시)와 `PATCH /api/designer-cards/[token]`
  라우트를 추가했다. 재제출을 허용해 디자이너가 응답을 나중에 수정할 수 있다.
  `/card/[slug]`와 새 디자이너 화면의 설문·판정 값을 한글 라벨로 보여주도록
  `lib/survey-labels.ts`로 통일했다. Supabase의 기존 테스트 카드로 실제 브라우저에서
  응답 저장 → 사용자 카드 화면에 "디자이너 의견: 조건부 가능"이 반영되는 것까지
  확인했고, `npm run lint` / `npx tsc --noEmit` / `npm run build` 모두 통과했다.
- [x] M5 실제 Gemini 연동 (2026-09-16, Codex) — 3.1 Flash Image, 스타일 레퍼런스, 1장 생성, Python 얼굴 정렬·semantic hair 합성을 연결했다. 유료 호출은 생성 확인 버튼에서만 시작한다.
- [x] M5a Gemini 어댑터·키 인증 (2026-09-16, Codex) — 모델 접근과 실제 이미지 출력, 프롬프트·레퍼런스 전달을 확인했다.
- [x] 추천·현장 피드백 반영 (2026-09-16, Codex) — 최근 펌·염색·탈색 이력을
  설문에 추가하고, 모발 상태 기반 남성 스타일 3개 추천을 넣었다. 기본은 비용 없는
  시즌 큐레이션이며, 같은 Gemini 키로 개인화 텍스트 추천을 선택적으로 활성화할 수 있다.
- [x] 얼굴 보존 합성 실험 (2026-09-16, Codex) — 이미지 모델을
  `gemini-3.1-flash-image`로 올리고, Python/OpenCV YuNet 얼굴 랜드마크 정렬 후
  생성된 짙은 헤어 영역만 원본 사진에 합성하는 로컬 MVP 후처리를 연결했다.
- [x] 합성 서비스 배포 분리 (2026-09-16, Claude) — Python 합성기가 로컬
  `.venv` 서브프로세스로만 동작해 Vercel 서버리스 함수에서는 실행 불가능하다는
  걸 확인했다 (Python 인터프리터·OpenCV·53MB 모델 파일이 배포 이미지에 없음).
  `python/server.py`(FastAPI)로 감싸고 `Dockerfile`을 추가해 별도 서비스로
  배포 가능하게 만들었고, `lib/server/hair-compositor.ts`에
  `HAIR_COMPOSITOR_PROVIDER=http` 모드를 추가해 그 서비스를 호출하도록
  했다(`python` 모드는 로컬 개발용으로 유지). 로컬에서 FastAPI 서버를 직접
  띄우고 실제 얼굴 사진으로 `/composite`를 호출해 정상 동작, 인증 실패(401),
  잘못된 입력(400) 케이스까지 확인했다. 실제 Render/Fly.io 등에 배포하는
  작업은 아직 사용자가 계정에서 직접 해야 한다.
- [x] GitHub 저장소 초기화·푸시 (2026-09-16, Claude) —
  `github.com/win401/hair_system`에 푸시. 실제 인물 사진(아이비리그컷
  레퍼런스)은 권리 미확인 상태로 public 저장소에 올리지 않기로 하고
  `.gitignore` 처리했다.
- [x] 스타일 레퍼런스를 Supabase Storage로 이전 (2026-09-16, Claude) — 위
  결정으로 로컬 파일을 못 쓰게 되면서 깨졌던 아이비리그컷 생성을, private
  `style-references` 버킷 + `getSupabaseAdmin().storage.download()`로
  바꿔 해결했다. 배포 방식과 무관하게 항상 동작한다.
- [ ] M6 프라이버시·QA 마무리
