import type { HairSurveyInput } from "@/lib/validation";
import { HAIR_STYLES } from "@/lib/styles";
import type { RecommendationResult, StyleRecommender } from "./types";

const LENGTH_ORDER = { short: 0, medium: 1, long: 2 };
const IVY_LEAGUE_STYLE_IDS = new Set(["ivy-league-classic", "ivy-league-cut"]);

export class TrendRecommender implements StyleRecommender {
  async recommend(survey: HairSurveyInput): Promise<RecommendationResult> {
    const available = HAIR_STYLES.filter(
      (style) => LENGTH_ORDER[survey.currentLength] >= LENGTH_ORDER[style.minimumLength]
    );
    const ranked = [...available]
      .sort((left, right) => score(right, survey) - score(left, survey))
      .slice(0, 3);

    return {
      source: "trend-curation",
      recommendations: ranked.map((style) => ({
        styleId: style.id,
        reason: `${style.trendNote} 현재 ${lengthLabel(survey.currentLength)}와 ${textureLabel(survey.textureCurl)} 모발에서 먼저 살펴볼 만해요.`,
        consideration: consideration(survey, style.id),
      })),
    };
  }
}

function score(style: (typeof HAIR_STYLES)[number], survey: HairSurveyInput) {
  let value = 0;
  if (style.id === "down-perm" && survey.textureCurl !== "straight") value += 4;
  if (IVY_LEAGUE_STYLE_IDS.has(style.id) && survey.currentLength === "short") value += 3;
  if (style.id === "shadow-perm" && survey.damageLevel === "low") value += 3;
  if (["leaf-cut", "gail-cut"].includes(style.id) && survey.currentLength !== "short") value += 2;
  if (survey.recentChemicalHistory === "bleach" && style.id !== "shadow-perm") value += 1;
  return value;
}

function consideration(survey: HairSurveyInput, styleId: string) {
  if (survey.damageLevel === "high" || survey.recentChemicalHistory === "bleach") {
    return "손상·탈색 이력이 있으면 펌 시술 가능 여부와 추가 관리가 필요할 수 있어요.";
  }
  if (styleId === "leaf-cut" || styleId === "gail-cut") {
    return "앞머리와 윗머리 길이가 부족하면 기르는 기간이 필요할 수 있어요.";
  }
  return "사진 결과는 참고용이며 실제 가능 여부는 디자이너 상담 후 확정돼요.";
}

function lengthLabel(length: HairSurveyInput["currentLength"]) {
  return { short: "짧은 길이", medium: "중간 길이", long: "긴 길이" }[length];
}

function textureLabel(texture: HairSurveyInput["textureCurl"]) {
  return { straight: "직모", wavy: "반곱슬", curly: "곱슬" }[texture];
}
