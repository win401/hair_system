export interface HairStyleOption {
  id: string;
  label: string;
  description: string;
  trendNote: string;
  minimumLength: "short" | "medium" | "long";
  generationBrief: string;
  referenceImagePaths: string[];
}

export const HAIR_STYLES: HairStyleOption[] = [
  {
    id: "leaf-cut",
    label: "리프컷",
    description: "앞머리와 옆머리를 자연스럽게 연결한 중장발 스타일",
    trendNote: "자연스러운 흐름과 가벼운 질감이 포인트인 스타일",
    minimumLength: "medium",
    generationBrief:
      "Korean men's leaf cut: medium-length layered top and fringe, soft C-shaped flow around the temples, natural volume, and a light curtain-like fringe. Keep the sides connected softly; do not turn it into a buzz cut, fade, pompadour, or perm.",
    referenceImagePaths: [],
  },
  {
    id: "gail-cut",
    label: "가일컷",
    description: "한쪽 이마를 드러내 깔끔하고 선명한 인상을 주는 스타일",
    trendNote: "단정함과 스타일링 변화를 함께 만들기 좋은 선택",
    minimumLength: "medium",
    generationBrief:
      "Korean men's gail cut: neatly tapered short sides, a longer textured top combed diagonally to one side, with a clean side part and a visible but natural forehead. Do not make a bowl cut, heavy fringe, buzz cut, or high skin fade.",
    referenceImagePaths: [],
  },
  {
    id: "see-through-dandy",
    label: "시스루 댄디컷",
    description: "가벼운 앞머리와 단정한 실루엣을 살린 데일리 스타일",
    trendNote: "부담 없이 이미지 변화를 만들기 좋은 데일리 스타일",
    minimumLength: "short",
    generationBrief:
      "Korean men's see-through dandy cut: tidy low-tapered sides, a soft rounded top, and a thin airy fringe with small gaps that lightly reaches the forehead. Do not create thick straight bangs, a bowl cut, or a dramatic fade.",
    referenceImagePaths: [],
  },
  {
    id: "ivy-league-classic",
    label: "아이비리그컷 · 클래식",
    description: "낮은 윗머리를 한쪽으로 부드럽게 흐르게 정돈한 클래식 스타일",
    trendNote: "낮은 볼륨과 자연스러운 옆 흐름으로 단정하게 연출하는 스타일",
    minimumLength: "short",
    generationBrief:
      "Korean men's classic low-profile Ivy League cut exactly like the supplied front-left Korean reference. Create a compact, close-to-the-head silhouette with a clean low-to-mid taper: roughly 3–6 mm visually at the sideburns and around the ears, blended gradually into the upper sides without a disconnected undercut or skin fade. Keep the top controlled and low, roughly 2.5–4 cm, with the front only slightly longer than the crown. Direct the top forward from the crown, then let the front flow gently toward one side with only subtle root lift. Show most of the forehead, but keep the side flow broad, soft, and natural rather than drawing a hard part. The top surface must lie close to the head and form one restrained directional flow—not upright spikes, a round dome, or a tall quiff. Preserve a naturally irregular front hairline and a tight temple outline. Straight or subtly textured strands only—no spiky crew cut, blunt fringe, French crop, Caesar cut, bowl shape, comma hair, pompadour, dramatic comb-over, curtain bangs, wet clumps, curls, or fluffy volume. The unmistakable result is the low, side-flowing classic Ivy League silhouette shown in the references.",
    // Paths are object keys in the private "style-references" Supabase
    // Storage bucket (see lib/ai/gemini-adapter.ts), not local files — the
    // real reference photos aren't committed to this public repo.
    referenceImagePaths: [
      "ivy-league/front-left.png",
      "ivy-league/front-left-hair.png",
    ],
  },
  {
    // Keep this legacy ID for existing sessions and saved consultation cards.
    id: "ivy-league-cut",
    label: "아이비리그컷 · 스파이키",
    description: "타이트한 옆머리와 짧게 세운 윗머리로 선명한 인상을 주는 스타일",
    trendNote: "짧고 분리된 직립 질감으로 스포티하게 연출하는 스타일",
    minimumLength: "short",
    generationBrief:
      "Korean men's short spiky Ivy League cut exactly like the supplied front and front-right Korean references. Create a compact, square, athletic silhouette with a clean low-to-mid taper: roughly 3–6 mm visually at the sideburns and around the ears, blended gradually into the upper sides without a disconnected undercut or harsh skin fade. Keep the top distinctly short and low, roughly 2–3.5 cm, with the front only slightly longer than the crown. Lift the short top strands upward and slightly forward into many fine, irregular, clearly separated points; keep at least 80% of the forehead visible. The front edge must be sparse and naturally broken, never a thick line of bangs. Keep the crown noticeably lower than the front, both side contours tight, and the total height restrained—do not form a round helmet, tall mound, or exaggerated quiff. Straight or subtly textured strands only—no low side-flowing classic Ivy League, generic textured crop, blunt fringe, French crop, Caesar cut, bowl shape, comma hair, pompadour, comb-over, curtain bangs, wet clumps, curls, or fluffy volume. The unmistakable result is the reference's very short Korean spiky Ivy League cut, not a longer crop or a rounded crew cut.",
    referenceImagePaths: [
      "ivy-league/front.png",
      "ivy-league/front-hair.png",
      "ivy-league/front-right.png",
      "ivy-league/front-right-hair.png",
    ],
  },
  {
    id: "shadow-perm",
    label: "쉐도우펌",
    description: "자연스러운 컬과 볼륨으로 부드러운 인상을 주는 펌",
    trendNote: "강한 컬보다 자연스러운 볼륨감을 선호할 때 어울리는 펌",
    minimumLength: "medium",
    generationBrief:
      "Korean men's shadow perm: medium-length layered hair with loose, soft S-shaped waves and natural volume. Keep the curl subtle and salon-achievable; do not create tight curls, an afro, long feminine waves, or change the haircut silhouette excessively.",
    referenceImagePaths: [],
  },
  {
    id: "down-perm",
    label: "다운펌",
    description: "뜨는 옆머리를 눌러 얼굴선을 정돈하는 남성 펌",
    trendNote: "옆머리 정돈으로 전체 인상을 빠르게 다듬는 선택",
    minimumLength: "short",
    generationBrief:
      "Korean men's down perm result: preserve the current top haircut while making only the side hair lie flatter and neater against the head. Keep volume on top. Do not create a new fade, buzz cut, long hair, or a completely different haircut.",
    referenceImagePaths: [],
  },
];

export function getHairStyleById(id: string): HairStyleOption | undefined {
  return HAIR_STYLES.find((style) => style.id === id);
}

export function isHairStyleId(id: string): boolean {
  return HAIR_STYLES.some((style) => style.id === id);
}
