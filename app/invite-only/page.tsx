export default function InviteOnlyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">초대 링크가 필요해요</h1>
      <p className="text-sm text-neutral-500">
        이 페이지는 전달받은 링크로만 열 수 있어요. 링크를 다시 확인해
        주세요.
      </p>
    </main>
  );
}
