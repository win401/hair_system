# 남성 헤어 상담 MVP

셀카와 모발 상태를 입력하고 남성 커트·펌 스타일을 선택해 결과 카드 흐름을
검증하는 Next.js 데모입니다. 현재 AI 결과 화면은 업로드한 원본을 반복 표시하는
목업이며, 실제 헤어 변환이라고 표시하지 않습니다.

## 실행

```bash
cp .env.example .env.local
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열고
`/start/demo-salon`에서 체험할 수 있습니다.

## 현재 범위

- 남성 헤어 6종 선택
- 셀카 리사이즈와 브라우저 세션 임시 보관
- 사진 이용 동의, 개별 삭제, 전체 초기화
- 생성 API의 스타일 allowlist와 JPEG/PNG/WebP 용량·파일 시그니처 검증
- 목업/실제 생성 제공자 명시적 분리

## 검증

```bash
npm run lint
npm run build
```

Gemini 3.1 Flash Lite Image 어댑터와 로컬 키 인증은 완료했습니다. 이미지 생성은
무료 티어가 아니므로 비용을 확인한 뒤에만 `HAIR_GENERATOR_PROVIDER=gemini`로
전환합니다. 기본값은 계속 `mock`입니다.
