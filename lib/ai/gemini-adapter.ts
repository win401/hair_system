import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import type {
  GenerateHairstyleInput,
  GeneratedImageResult,
  HairstyleGenerator,
} from "./types";
import { getHairStyleById } from "@/lib/styles";
import { preserveOriginalPortrait } from "@/lib/server/hair-compositor";

const VARIANTS = [
  {
    label: "AI 정밀 미리보기",
    direction: "Use the exact requested haircut geometry with a controlled, low-product, photorealistic salon finish.",
  },
  {
    label: "균형 잡힌 변화",
    direction: "Use the exact same requested haircut geometry with balanced texture and a realistic salon finish.",
  },
  {
    label: "과감한 변화",
    direction: "Use the exact same requested haircut geometry with slightly stronger styling texture only; do not make the cut, length, or silhouette more extreme.",
  },
];

const LENGTH_LABELS = {
  short: "short hair, top shorter than about 6 cm",
  medium: "medium-length hair around eyebrow to ear length",
  long: "long hair around the jawline or longer",
};

const TEXTURE_LABELS = {
  straight: "straight",
  wavy: "naturally wavy",
  curly: "curly",
};

const DAMAGE_LABELS = {
  low: "low damage",
  medium: "moderate damage",
  high: "high damage from repeated bleaching or perming",
};

export class GeminiHairstyleGenerator implements HairstyleGenerator {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model = "gemini-3.1-flash-image"
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateHairstyle(
    input: GenerateHairstyleInput
  ): Promise<GeneratedImageResult[]> {
    const style = getHairStyleById(input.styleId);
    if (!style) throw new Error("지원하지 않는 헤어스타일입니다.");

    const source = parseDataUrl(input.selfieDataUrl);
    const references = await loadReferenceImages(style.referenceImagePaths);
    const variants = VARIANTS.slice(0, input.variantCount ?? 1);
    const results: GeneratedImageResult[] = [];

    // Run sequentially so a small pilot is less likely to hit burst limits.
    for (const variant of variants) {
      const interaction = await this.client.interactions.create(
        {
          model: this.model,
          store: false,
          input: [
            {
              type: "text",
              text: "The next image is the CUSTOMER PORTRAIT. Preserve this person's identity and every non-hair feature.",
            },
            {
              type: "image",
              mime_type: source.mimeType,
              data: source.base64,
            },
            ...(references.length
              ? [
                  {
                    type: "text" as const,
                    text: "The following images are HAIRSTYLE REFERENCES ONLY. Use only their haircut silhouette, length, taper, direction, and texture. Never copy or blend any reference person's face, skin, facial hair, ears, body, clothing, background, or identity into the customer portrait.",
                  },
                  ...references.map((reference) => ({
                    type: "image" as const,
                    mime_type: reference.mimeType,
                    data: reference.base64,
                  })),
                ]
              : []),
            {
              type: "text",
              text: buildPrompt(
                input,
                style.label,
                style.generationBrief,
                variant.direction,
                references.length
              ),
            },
          ],
          response_format: {
            type: "image",
            mime_type: "image/jpeg",
            image_size: "1K",
            ...(source.aspectRatio
              ? { aspect_ratio: source.aspectRatio }
              : {}),
          },
        },
        { timeout: 120_000, maxRetries: 1 }
      );

      const image = interaction.output_image;
      if (!image?.data || !image.mime_type?.startsWith("image/")) {
        throw new Error("Gemini가 이미지 결과를 반환하지 않았습니다.");
      }

      const dataUrl = await preserveOriginalPortrait({
        sourceDataUrl: input.selfieDataUrl,
        generatedBase64: image.data,
        styleId: input.styleId,
      });

      results.push({
        dataUrl,
        isMock: false,
        provider: "gemini-image",
        label: variant.label,
      });
    }

    return results;
  }
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("지원하지 않는 셀카 형식입니다.");
  const bytes = Buffer.from(match[2], "base64");
  const dimensions = readImageDimensions(bytes, match[1]);
  return {
    mimeType: match[1],
    base64: match[2],
    aspectRatio: dimensions
      ? closestOutputAspectRatio(dimensions.width / dimensions.height)
      : null,
  };
}

const OUTPUT_ASPECT_RATIOS = [
  ["1:1", 1],
  ["2:3", 2 / 3],
  ["3:2", 3 / 2],
  ["3:4", 3 / 4],
  ["4:3", 4 / 3],
  ["4:5", 4 / 5],
  ["5:4", 5 / 4],
  ["9:16", 9 / 16],
  ["16:9", 16 / 9],
] as const;

function closestOutputAspectRatio(ratio: number) {
  return OUTPUT_ASPECT_RATIOS.reduce((closest, candidate) =>
    Math.abs(candidate[1] - ratio) < Math.abs(closest[1] - ratio)
      ? candidate
      : closest
  )[0];
}

function readImageDimensions(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType !== "image/jpeg" || bytes.length < 12) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

async function loadReferenceImages(referenceImagePaths: string[]) {
  return Promise.all(
    referenceImagePaths.map(async (referencePath) => ({
      mimeType: mimeTypeForPath(referencePath),
      base64: (await readFile(resolveReferencePath(referencePath))).toString("base64"),
    }))
  );
}

const STYLE_REFERENCE_PREFIX = "assets/style-references/";

function resolveReferencePath(referencePath: string) {
  if (
    !referencePath.startsWith(STYLE_REFERENCE_PREFIX) ||
    referencePath.includes("..")
  ) {
    throw new Error("허용되지 않은 헤어스타일 기준 이미지 경로입니다.");
  }
  return path.join(
    process.cwd(),
    "assets/style-references",
    referencePath.slice(STYLE_REFERENCE_PREFIX.length)
  );
}

function mimeTypeForPath(referencePath: string) {
  if (referencePath.endsWith(".png")) return "image/png";
  if (referencePath.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function buildPrompt(
  input: GenerateHairstyleInput,
  styleLabel: string,
  styleGenerationBrief: string,
  variantDirection: string,
  referenceCount: number
) {
  return `This is a strict, high-fidelity hairstyle-only edit of the supplied portrait. Do not create a new person or reinterpret the portrait.

TARGET HAIRCUT — ${styleLabel}:
${styleGenerationBrief}
${referenceCount ? `Use the ${referenceCount} hairstyle reference images as the primary visual authority for the haircut. Adapt that hair structure naturally to the CUSTOMER PORTRAIT's own head shape, hairline, density, camera angle, and lighting. Do not copy pixels or identity from the references.` : "No hairstyle reference images are available, so follow the written haircut specification exactly."}

HAIRLINE AND COMPOSITING REALISM:
- The new hair must grow from the customer's real scalp. Keep a naturally irregular, individual hairline with fine short transition hairs; never create a ruler-straight, painted, stamped, helmet-like, or wig-like front edge.
- Match the customer's original hair color, strand thickness, lighting direction, sharpness, image grain, and shadow on the forehead and temples.
- Preserve visible forehead skin between raised strands. Do not cover the forehead with a blunt fringe unless the target haircut explicitly requires one.
- Blend the temple hair and side taper continuously into the customer's own head contour and ears, without halos, cutout edges, background leakage, or duplicated ears.
- Preserve the original portrait framing and subject scale. Keep the face centered at the same position and size so the edited image registers exactly over the input.

NON-NEGOTIABLE IDENTITY LOCK:
- Edit hair pixels only. Every non-hair area must remain unchanged from the input image.
- Preserve exactly: face shape, eyes, eyebrows, nose, lips, jaw, skin texture and tone, expression, age, body, ears, glasses, clothing, pose, camera angle, lighting, and background.
- Preserve facial hair exactly as in the input. If the input has no beard or moustache, the output MUST have no beard and no moustache. Never add, remove, thicken, darken, or reshape facial hair.
- Do not beautify, retouch, slim, age, masculinize, or otherwise alter the person.
- Keep hairline, density, and achievable length physically plausible for the supplied current condition.

Hair condition supplied by the customer:
- Current length: ${LENGTH_LABELS[input.survey.currentLength]}
- Texture: ${TEXTURE_LABELS[input.survey.textureCurl]}
- Damage: ${DAMAGE_LABELS[input.survey.damageLevel]}
- Recent chemical history: ${input.survey.recentChemicalHistory}

VARIANT FINISH: ${variantDirection}
The target haircut above must remain unmistakably ${styleLabel} in every variant. Produce one photorealistic salon consultation preview without text, labels, borders, collage, watermark, or before-and-after layout.`;
}
