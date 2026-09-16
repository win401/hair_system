"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getHairStyleById, HAIR_STYLES } from "@/lib/styles";
import { useWizard } from "@/lib/wizard-context";
import type { RecommendationResult } from "@/lib/recommendation/types";

export default function StylePage() {
  const router = useRouter();
  const wizard = useWizard();
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);

  useEffect(() => {
    if (wizard.isHydrated && (!wizard.selfieDataUrl || !wizard.survey)) {
      router.replace("/");
    }
  }, [wizard.isHydrated, wizard.selfieDataUrl, wizard.survey, router]);

  useEffect(() => {
    if (!wizard.isHydrated || !wizard.survey) return;
    let cancelled = false;
    void fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey: wizard.survey }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as RecommendationResult;
      })
      .then((result) => {
        if (!cancelled) setRecommendations(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wizard.isHydrated, wizard.survey]);

  function selectStyle(styleId: string) {
    wizard.setStyleId(styleId);
    router.push("/generate");
  }

  if (!wizard.isHydrated || !wizard.selfieDataUrl || !wizard.survey) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">원하는 남성 스타일을 선택해 주세요</h1>
        <p className="mt-1 text-sm text-neutral-500">
          현재 길이와 손상도를 바탕으로 디자이너와 시술 가능 여부를 상담할 수 있어요.
        </p>
      </div>
      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">내 모발 상태 기반 추천</h2>
          {recommendations && (
            <span className="text-xs text-neutral-500">
              {recommendations.source === "gemini" ? "AI 개인화 추천" : "이번 시즌 큐레이션"}
            </span>
          )}
        </div>
        {!recommendations ? (
          <p className="mt-2 text-sm text-neutral-500">추천을 준비하고 있어요...</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {recommendations.recommendations.map((recommendation) => {
              const style = getHairStyleById(recommendation.styleId);
              if (!style) return null;
              return (
                <button
                  key={recommendation.styleId}
                  type="button"
                  onClick={() => selectStyle(recommendation.styleId)}
                  className="rounded-md border border-neutral-200 bg-white p-3 text-left"
                >
                  <div className="text-sm font-medium">추천 · {style.label}</div>
                  <p className="mt-1 text-sm text-neutral-600">{recommendation.reason}</p>
                  <p className="mt-1 text-xs text-amber-800">{recommendation.consideration}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 gap-3">
        {HAIR_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => selectStyle(style.id)}
            className="rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:border-neutral-900"
          >
            <div className="font-medium">{style.label}</div>
            <div className="mt-1 text-sm text-neutral-500">
              {style.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
