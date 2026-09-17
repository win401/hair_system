# 남성 헤어 상담 MVP

셀카와 현재 모발 상태를 바탕으로 남성 헤어스타일을 미리 확인하고, 결과를 상담
카드로 만들어 디자이너 검토와 네이버 예약으로 연결하는 Next.js 서비스입니다.

프로덕션은 링크 전용 접근 게이트를 적용해 Vercel에 배포되어 있습니다. 실제 접근
토큰과 API 키는 저장소에 포함하지 않습니다.

## 현재 구현

- 남성 커트·펌 7종: 아이비리그컷은 클래식/스파이키 별도 제공
- Gemini 3.1 Flash Image 정밀 미리보기 1장
- 아이비리그 기준 이미지는 private Supabase Storage에서 서버가 로드
- Python/OpenCV 합성기로 원본 얼굴을 유지하고 생성된 헤어 영역만 반영
- Render 합성 서비스 콜드 스타트를 유료 Gemini 호출 전에 확인
- 원본/결과 비교 슬라이더, 재방문 사진 캐시, 사진 삭제·전체 초기화
- `/camera` 기기 내 얼굴 추적 기반 아이비리그 2D AR 베타와 캡처 연결
- Supabase 상담 카드 저장과 디자이너 응답 화면
- 링크 토큰을 아는 파일럿 사용자만 접근 가능한 게이트

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

필수 환경변수의 실제 값은 Vercel·Render·Supabase 대시보드 또는 로컬
`.env.local`에서 관리합니다. 전체 목록은 `.env.example`을 참고하세요.

로컬 Python 합성기를 사용하려면:

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

## 검증

```bash
npm run lint
npx tsc --noEmit
npm run build
./.venv/bin/python -m py_compile python/hair_composite.py python/server.py
```

## 문서

- 현재 배포·환경·남은 작업: [`docs/06-handoff.md`](docs/06-handoff.md)
- 구현 계획: [`docs/05-mvp-implementation-plan.md`](docs/05-mvp-implementation-plan.md)
- 실시간 카메라 AR 계획: [`docs/07-live-camera-ar-plan.md`](docs/07-live-camera-ar-plan.md)
- 실서비스 백엔드·앱 로드맵: [`docs/08-production-backend-and-app-roadmap.md`](docs/08-production-backend-and-app-roadmap.md)
- 상세 작업 로그: [`AGENTS.md`](AGENTS.md)
