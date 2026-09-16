import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { HairSurveyInput } from "@/lib/validation";
import { HAIR_STYLES, isHairStyleId } from "@/lib/styles";
import type { RecommendationResult, StyleRecommendation, StyleRecommender } from "./types";

export class GeminiStyleRecommender implements StyleRecommender {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async recommend(survey: HairSurveyInput): Promise<RecommendationResult> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: buildPrompt(survey),
      config: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 700 },
    });
    const parsed = parseRecommendation(response.text);
    if (!parsed.length) throw new Error("Gemini 추천 결과 형식이 올바르지 않습니다.");
    return { source: "gemini", recommendations: parsed.slice(0, 3) };
  }
}

function buildPrompt(survey: HairSurveyInput) {
  const options = HAIR_STYLES.map((style) => `${style.id}: ${style.label} — ${style.description}`).join("\n");
  return `You are a careful Korean men's hairstyling consultation assistant. Recommend exactly three options only from the approved list. Do not make claims about face shape, and do not promise salon feasibility. Respond in Korean JSON only: {"recommendations":[{"styleId":"approved-id","reason":"one concise sentence","consideration":"one concise sentence"}]}.\n\nCustomer hair data: ${JSON.stringify(survey)}\n\nApproved styles:\n${options}`;
}

function parseRecommendation(text: string | undefined): StyleRecommendation[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text) as { recommendations?: unknown[] };
    if (!Array.isArray(value.recommendations)) return [];
    return value.recommendations.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      if (!isHairStyleId(String(candidate.styleId))) return [];
      if (typeof candidate.reason !== "string" || typeof candidate.consideration !== "string") return [];
      return [{ styleId: String(candidate.styleId), reason: candidate.reason.slice(0, 180), consideration: candidate.consideration.slice(0, 180) }];
    });
  } catch {
    return [];
  }
}
