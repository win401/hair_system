import type { HairSurveyInput } from "@/lib/validation";

export interface StyleRecommendation {
  styleId: string;
  reason: string;
  consideration: string;
}

export interface RecommendationResult {
  source: "trend-curation" | "gemini";
  recommendations: StyleRecommendation[];
}

export interface StyleRecommender {
  recommend(survey: HairSurveyInput): Promise<RecommendationResult>;
}
