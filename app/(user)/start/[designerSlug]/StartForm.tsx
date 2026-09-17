"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { hairSurveySchema, type HairSurveyInput } from "@/lib/validation";
import { useWizard } from "@/lib/wizard-context";
import { resizeImageFile } from "@/lib/image";

const LENGTH_OPTIONS: { value: HairSurveyInput["currentLength"]; label: string }[] = [
  { value: "short", label: "짧음 (윗머리 약 6cm 미만)" },
  { value: "medium", label: "중간 (눈썹~귀를 덮는 길이)" },
  { value: "long", label: "긴 머리 (턱선 전후 또는 그 이상)" },
];

const TEXTURE_OPTIONS: { value: HairSurveyInput["textureCurl"]; label: string }[] = [
  { value: "straight", label: "직모" },
  { value: "wavy", label: "반곱슬 · 웨이브" },
  { value: "curly", label: "곱슬" },
];

const DAMAGE_OPTIONS: { value: HairSurveyInput["damageLevel"]; label: string }[] = [
  { value: "low", label: "손상 적음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "손상 많음 (탈색 · 펌 반복)" },
];

const CHEMICAL_HISTORY_OPTIONS: { value: HairSurveyInput["recentChemicalHistory"]; label: string }[] = [
  { value: "none", label: "최근 시술 없음" },
  { value: "perm", label: "펌" },
  { value: "color", label: "염색" },
  { value: "bleach", label: "탈색" },
  { value: "multiple", label: "펌·염색·탈색을 여러 번 함" },
];

export function StartForm({
  designerSlug,
  isMockMode,
}: {
  designerSlug: string;
  isMockMode: boolean;
}) {
  const router = useRouter();
  const wizard = useWizard();
  // Start empty (not wizard.selfieDataUrl) so hydration matches the SSR
  // render, then sync from the wizard once browser storage has been restored
  // on the client — see the isHydrated comment in lib/wizard-context.tsx.
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HairSurveyInput>({
    resolver: zodResolver(hairSurveySchema),
  });

  useEffect(() => {
    if (!wizard.isHydrated) return;
    // One-time sync from the wizard right after it restores browser storage
    // (see isHydrated in lib/wizard-context.tsx), not a derived-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(wizard.selfieDataUrl);
    if (wizard.survey) reset(wizard.survey);
    // Only meant to run once, right after the wizard finishes restoring
    // state from browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.isHydrated]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (!wizard.selfieConsent) {
      setImageError("사진 이용 안내에 동의한 뒤 업로드해 주세요.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setIsProcessingImage(true);
    try {
      const processed = await resizeImageFile(file);
      setPreview(processed.dataUrl);
      wizard.setSelfie(processed.dataUrl);
      setImageWarning(
        Math.max(processed.sourceWidth, processed.sourceHeight) < 512
          ? `원본이 ${processed.sourceWidth}×${processed.sourceHeight}px로 작아요. 자동 보정했지만 카메라 원본이나 720px 이상의 사진을 사용하면 머리카락 경계가 더 자연스러워집니다.`
          : null
      );
    } catch {
      setImageError("사진을 처리하지 못했어요. 다른 사진으로 다시 시도해 주세요.");
    } finally {
      setIsProcessingImage(false);
    }
  }

  function removeSelfie() {
    wizard.clearSelfie();
    setPreview(null);
    setImageError(null);
    setImageWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleConsentChange(consented: boolean) {
    wizard.setSelfieConsent(consented);
    if (!consented) removeSelfie();
  }

  function onSubmit(values: HairSurveyInput) {
    if (!wizard.selfieConsent) {
      setImageError("사진 이용 안내에 동의해 주세요.");
      return;
    }
    if (!preview) {
      setImageError("셀카를 먼저 업로드해 주세요.");
      return;
    }
    wizard.setDesignerSlug(designerSlug);
    wizard.setSurvey(values);
    router.push("/style");
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto flex w-full max-w-md flex-col gap-6 p-6"
    >
      <div>
        <h1 className="text-xl font-semibold">내 얼굴로 남성 헤어 체험하기</h1>
        <p className="mt-1 text-sm text-neutral-500">
          <strong>{designerSlug}</strong> 디자이너 전용 링크로 접속하셨어요.
          셀카와 모발 상태를 알려주신 뒤 원하는 스타일을 고르면 AI 정밀
          미리보기를 보여드려요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium">사진 이용 안내</p>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            사진은 다시 업로드하지 않아도 되도록 이 기기의 브라우저에 보관하며,
            서비스 DB에는 자동 저장하지 않습니다.
            {isMockMode
              ? " 현재 목업에서는 외부 AI로 전송하지 않습니다."
              : " 헤어 이미지 생성을 위해 Google Gemini API로 전송됩니다."}
            아래의 사진 삭제 또는 결과 화면의 전체 초기화로 언제든 이 기기에서
            지울 수 있습니다. 브라우저 데이터 삭제 시에도 함께 삭제됩니다.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={wizard.selfieConsent}
              onChange={(event) => handleConsentChange(event.target.checked)}
              className="mt-0.5"
            />
            위 내용을 확인했으며 사진 처리에 동의합니다.
          </label>
        </div>
        <label className="text-sm font-medium" htmlFor="selfie">
          셀카 업로드
        </label>
        <p className="text-xs leading-5 text-neutral-500">
          밝고 단순한 배경에서 정면을 보고 촬영해 주세요. 얼굴 전체와 헤어라인,
          귀가 보여야 원본 얼굴을 고정하고 머리 영역만 자연스럽게 합성할 수 있어요.
          긴 변 기준 720px 이상의 카메라 원본을 권장합니다.
        </p>
        <input
          ref={fileInputRef}
          id="selfie"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={!wizard.selfieConsent || isProcessingImage}
          className="text-sm disabled:opacity-50 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:text-white"
        />
        <Link
          href="/camera"
          className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-center text-sm font-medium text-violet-800"
        >
          카메라 AR로 아이비리그컷 먼저 보기
        </Link>
        {isProcessingImage && (
          <p className="text-sm text-neutral-500">사진 처리 중...</p>
        )}
        {imageError && <p className="text-sm text-red-600">{imageError}</p>}
        {imageWarning && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {imageWarning}
          </p>
        )}
        {preview && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs font-medium text-emerald-700">
              이 기기에 저장됨 · 다음 방문에는 자동으로 불러옵니다.
            </p>
            <div className="flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="업로드한 셀카 미리보기"
                className="h-48 w-48 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={removeSelfie}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                사진 삭제
              </button>
            </div>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">현재 머리 길이</legend>
        {LENGTH_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input type="radio" value={opt.value} {...register("currentLength")} />
            {opt.label}
          </label>
        ))}
        {errors.currentLength && (
          <p className="text-sm text-red-600">머리 길이를 선택해 주세요.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">직모 · 곱슬 여부</legend>
        {TEXTURE_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input type="radio" value={opt.value} {...register("textureCurl")} />
            {opt.label}
          </label>
        ))}
        {errors.textureCurl && (
          <p className="text-sm text-red-600">모발 질감을 선택해 주세요.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">손상도</legend>
        {DAMAGE_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input type="radio" value={opt.value} {...register("damageLevel")} />
            {opt.label}
          </label>
        ))}
        {errors.damageLevel && (
          <p className="text-sm text-red-600">손상도를 선택해 주세요.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">최근 펌 · 염색 · 탈색 이력</legend>
        {CHEMICAL_HISTORY_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input type="radio" value={opt.value} {...register("recentChemicalHistory")} />
            {opt.label}
          </label>
        ))}
        {errors.recentChemicalHistory && (
          <p className="text-sm text-red-600">최근 시술 이력을 선택해 주세요.</p>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={isProcessingImage || !wizard.selfieConsent}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        다음: 스타일 선택
      </button>
    </form>
  );
}
