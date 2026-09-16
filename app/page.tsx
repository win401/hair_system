import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">
          내 얼굴로 먼저 확인하는 남성 헤어스타일
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          셀카와 모발 상태를 입력하고 원하는 남성 커트·펌을 고르면 AI 정밀
          미리보기를 만들어요. 이후 전문 디자이너가 실제 시술 가능 여부를
          확인합니다.
        </p>
      </div>
      <Link
        href="/start/demo-salon"
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
      >
        체험 시작하기 (데모)
      </Link>
    </main>
  );
}
