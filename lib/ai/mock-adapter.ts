import type {
  GenerateHairstyleInput,
  GeneratedImageResult,
  HairstyleGenerator,
} from "./types";

const VARIANT_LABELS = [
  "AI 정밀 미리보기",
  "결과 카드 자리 2",
  "결과 카드 자리 3",
];

// Returns the original selfie unmodified, tagged as a mock result. Used
// in the default mock mode so the full product loop stays clickable without
// pretending that a hairstyle transformation occurred.
export class MockHairstyleGenerator implements HairstyleGenerator {
  async generateHairstyle(
    input: GenerateHairstyleInput
  ): Promise<GeneratedImageResult[]> {
    await simulateLatency();

    const count = input.variantCount ?? 1;
    return Array.from({ length: count }).map((_, i) => ({
      dataUrl: input.selfieDataUrl,
      isMock: true,
      provider: "mock" as const,
      label: VARIANT_LABELS[i] ?? `체험 결과 ${i + 1}`,
    }));
  }
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 900));
}
