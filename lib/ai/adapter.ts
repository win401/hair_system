import type { HairstyleGenerator } from "./types";
import { MockHairstyleGenerator } from "./mock-adapter";
import { GeminiHairstyleGenerator } from "./gemini-adapter";

export function getHairstyleGenerator(): HairstyleGenerator {
  const provider = process.env.HAIR_GENERATOR_PROVIDER ?? "mock";
  if (provider === "mock") return new MockHairstyleGenerator();

  if (provider !== "gemini") {
    throw new Error(`Unsupported HAIR_GENERATOR_PROVIDER: ${provider}`);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required when HAIR_GENERATOR_PROVIDER=gemini.");
  }
  return new GeminiHairstyleGenerator(
    apiKey,
    process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image"
  );
}

export function isMockMode(): boolean {
  return (process.env.HAIR_GENERATOR_PROVIDER ?? "mock") === "mock";
}
