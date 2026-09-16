import type { HairSurveyInput } from "@/lib/validation";

export interface GenerateHairstyleInput {
  selfieDataUrl: string;
  styleId: string;
  survey: HairSurveyInput;
  variantCount?: number;
}

export type ImageProvider = "mock" | "gemini-image";

export interface GeneratedImageResult {
  dataUrl: string;
  isMock: boolean;
  provider: ImageProvider;
  label: string;
}

export interface HairstyleGenerator {
  generateHairstyle(
    input: GenerateHairstyleInput
  ): Promise<GeneratedImageResult[]>;
}
