"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "@/lib/wizard-context";
import { getHairStyleById } from "@/lib/styles";
import type { GeneratedImageResult } from "@/lib/ai/types";

type Status = "ready" | "loading" | "error" | "done";

function BeforeAfterComparison({
  originalDataUrl,
  result,
}: {
  originalDataUrl: string;
  result: GeneratedImageResult;
}) {
  const [originalPercent, setOriginalPercent] = useState(50);
  const comparisonId = useId();

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="relative isolate overflow-hidden bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.dataUrl}
          alt={`${result.label} AI 결과`}
          className="block h-auto w-full"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalDataUrl}
          alt="업로드한 원본 사진"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - originalPercent}% 0 0)` }}
        />

        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-xs font-medium text-white">
          원본
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/65 px-2 py-1 text-xs font-medium text-white">
          AI 결과
        </span>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.55)]"
          style={{ left: `${originalPercent}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-neutral-900 text-sm font-semibold text-white shadow-md">
            ↔
          </span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={comparisonId}
            className="text-sm font-medium"
          >
            원본과 결과 비교
          </label>
          <span className="text-xs text-neutral-500">경계를 좌우로 움직여 보세요</span>
        </div>
        <input
          id={comparisonId}
          type="range"
          min="0"
          max="100"
          value={originalPercent}
          onChange={(event) => setOriginalPercent(Number(event.target.value))}
          aria-label="원본과 AI 결과 비교 경계"
          aria-valuetext={`원본 ${originalPercent}% 표시`}
          className="mt-3 h-2 w-full cursor-ew-resize accent-neutral-900"
        />
        <div className="mt-1 flex justify-between text-xs text-neutral-500">
          <span>결과 많이 보기</span>
          <span>원본 많이 보기</span>
        </div>
        <p className="mt-3 text-sm font-medium">{result.label}</p>
      </div>
    </div>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const wizard = useWizard();
  const [status, setStatus] = useState<Status>("ready");
  const [images, setImages] = useState<GeneratedImageResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const generationInFlight = useRef(false);

  useEffect(() => {
    if (!wizard.isHydrated) return;
    if (!wizard.selfieDataUrl || !wizard.survey || !wizard.styleId) {
      router.replace("/");
      return;
    }

  }, [wizard.isHydrated, wizard.selfieDataUrl, wizard.survey, wizard.styleId, router]);

  async function runGeneration() {
    if (
      generationInFlight.current ||
      !wizard.selfieDataUrl ||
      !wizard.survey ||
      !wizard.styleId
    ) {
      return;
    }

    generationInFlight.current = true;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selfieDataUrl: wizard.selfieDataUrl,
          styleId: wizard.styleId,
          survey: wizard.survey,
        }),
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message ?? "생성에 실패했어요.");
      }
      const body: { images: GeneratedImageResult[] } = await res.json();
      setImages(body.images);
      setStatus("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요."
      );
      setStatus("error");
    } finally {
      generationInFlight.current = false;
    }
  }

  const style = wizard.styleId ? getHairStyleById(wizard.styleId) : undefined;

  function retry() {
    void runGeneration();
  }

  function resetExperience() {
    wizard.reset();
    router.push(getStartPath());
  }

  function getStartPath() {
    return wizard.designerSlug
      ? `/start/${encodeURIComponent(wizard.designerSlug)}`
      : "/";
  }

  function chooseAnotherStyle() {
    router.push("/style");
  }

  function changePhoto() {
    // Do not clear the current IndexedDB photo here. StartForm restores it as
    // a preview and only replaces the cache after the user picks a new file.
    router.push(getStartPath());
  }

  if (status === "ready") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">
          {style?.label ?? "선택한 스타일"} 미리보기 준비 완료
        </h1>
        <p className="text-sm leading-6 text-neutral-600">
          아래 버튼을 누를 때 Gemini 이미지 생성 API를 1회 호출합니다. 페이지를
          새로고침하는 것만으로는 생성하거나 비용을 사용하지 않아요.
        </p>
        <button
          type="button"
          onClick={() => void runGeneration()}
          className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
        >
          AI 헤어 미리보기 생성
        </button>
        <button
          type="button"
          onClick={chooseAnotherStyle}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium"
        >
          다른 스타일 선택
        </button>
        <button
          type="button"
          onClick={changePhoto}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium"
        >
          사진 변경
        </button>
      </div>
    );
  }

  async function createCard() {
    if (!wizard.designerSlug || !wizard.selfieDataUrl || !wizard.survey || !wizard.styleId) return;
    setIsCreatingCard(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designerSlug: wizard.designerSlug,
          selfieDataUrl: wizard.selfieDataUrl,
          survey: wizard.survey,
          styleId: wizard.styleId,
          images: images.map(({ dataUrl, label }) => ({ dataUrl, label })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.slug) throw new Error(body.message ?? "상담 카드를 저장하지 못했어요.");
      router.push(`/card/${body.slug}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "상담 카드 저장에 실패했어요.");
    } finally {
      setIsCreatingCard(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">
          {style?.label ?? "스타일"} 시뮬레이션 생성 중...
        </h1>
        <p className="text-sm text-neutral-500">잠시만 기다려 주세요.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">생성에 실패했어요</h1>
        <p className="text-sm text-red-600">{errorMessage}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
        >
          같은 조건으로 다시 시도
        </button>
        <p className="text-xs leading-5 text-amber-800">
          실제 AI 모드에서는 다시 시도할 때 이미지 생성 API가 새로 호출되어
          사용료가 발생할 수 있어요.
        </p>
        <button
          type="button"
          onClick={chooseAnotherStyle}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium"
        >
          다른 스타일 선택
        </button>
        <button
          type="button"
          onClick={changePhoto}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium"
        >
          사진 변경
        </button>
        <button
          type="button"
          onClick={resetExperience}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium"
        >
          사진과 입력 내용 모두 지우기
        </button>
      </div>
    );
  }

  const selfieDataUrl = wizard.selfieDataUrl;
  if (!selfieDataUrl) return null;

  const isMockRun = images.some((img) => img.isMock);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{style?.label} 체험 결과</h1>
      {isMockRun && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          현재는 화면 흐름 확인용 목업입니다. 아래 이미지는 변환 결과가 아니라
          업로드한 원본을 결과 카드 자리에 표시한 것입니다.
        </div>
      )}
      <div className="flex flex-col gap-4">
        {images.map((img, i) => (
          <BeforeAfterComparison
            key={`${img.label}-${i}`}
            originalDataUrl={selfieDataUrl}
            result={img}
          />
        ))}
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        type="button"
        onClick={createCard}
        disabled={isCreatingCard || !wizard.designerSlug}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isCreatingCard ? "상담 카드 저장 중..." : "상담 카드 만들기"}
      </button>
      <button
        type="button"
        onClick={chooseAnotherStyle}
        disabled={isCreatingCard}
        className="rounded-md border border-neutral-900 px-4 py-3 text-sm font-medium disabled:opacity-50"
      >
        다른 스타일 선택
      </button>
      <p className="-mt-2 text-center text-xs text-neutral-500">
        사진과 모발 상태 입력은 그대로 유지됩니다.
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <button
          type="button"
          onClick={retry}
          disabled={isCreatingCard}
          className="w-full rounded-md border border-amber-700 bg-white px-4 py-3 text-sm font-medium text-amber-900 disabled:opacity-50"
        >
          {isMockRun
            ? "같은 조건으로 다시 생성 (목업)"
            : "같은 조건으로 다시 생성 (유료 API 재호출)"}
        </button>
        <p className="mt-2 text-xs leading-5 text-amber-800">
          {isMockRun
            ? "현재 목업에서는 비용이 발생하지 않습니다. 실제 AI 모드에서는 다시 생성할 때마다 사용료가 발생할 수 있어요."
            : "버튼을 누르면 Gemini 이미지 생성 API를 새로 호출하므로 추가 사용료가 발생합니다."}
        </p>
      </div>
      <button
        type="button"
        onClick={changePhoto}
        disabled={isCreatingCard}
        className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium disabled:opacity-50"
      >
        사진 변경
      </button>
      <p className="-mt-2 text-center text-xs text-neutral-500">
        현재 사진은 지우지 않고 시작 화면에서 바로 교체할 수 있어요.
      </p>
      <button
        type="button"
        onClick={resetExperience}
        disabled={isCreatingCard}
        className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium disabled:opacity-50"
      >
        사진과 입력 내용 모두 지우고 처음부터
      </button>
    </div>
  );
}
