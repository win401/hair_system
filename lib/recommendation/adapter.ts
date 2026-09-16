import "server-only";

import type { StyleRecommender } from "./types";
import { TrendRecommender } from "./trend-recommender";
import { GeminiStyleRecommender } from "./gemini-recommender";

export function getStyleRecommender(): StyleRecommender {
  const provider = process.env.HAIR_RECOMMENDER_PROVIDER ?? "trend-curation";
  if (provider === "trend-curation") return new TrendRecommender();
  if (provider !== "gemini") throw new Error(`Unsupported HAIR_RECOMMENDER_PROVIDER: ${provider}`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when HAIR_RECOMMENDER_PROVIDER=gemini.");
  return new GeminiStyleRecommender(apiKey, process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash");
}
