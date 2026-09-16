export const LENGTH_LABELS: Record<string, string> = {
  short: "짧음 (윗머리 약 6cm 미만)",
  medium: "중간 (눈썹~귀를 덮는 길이)",
  long: "긴 머리 (턱선 전후 또는 그 이상)",
};

export const TEXTURE_LABELS: Record<string, string> = {
  straight: "직모",
  wavy: "반곱슬 · 웨이브",
  curly: "곱슬",
};

export const DAMAGE_LABELS: Record<string, string> = {
  low: "손상 적음",
  medium: "보통",
  high: "손상 많음 (탈색 · 펌 반복)",
};

export const CHEMICAL_LABELS: Record<string, string> = {
  none: "최근 시술 없음",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  multiple: "펌·염색·탈색을 여러 번 함",
};

export const VERDICT_LABELS: Record<string, string> = {
  possible: "가능",
  conditional: "조건부 가능",
  difficult: "어려움",
};
