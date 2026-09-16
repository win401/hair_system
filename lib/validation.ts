import { z } from "zod";
import {
  IMAGE_DATA_URL_PATTERN,
  MAX_IMAGE_DATA_URL_LENGTH,
} from "@/lib/image-constraints";
import { isHairStyleId } from "@/lib/styles";

export const hairSurveySchema = z.object({
  currentLength: z.enum(["short", "medium", "long"]),
  textureCurl: z.enum(["straight", "wavy", "curly"]),
  damageLevel: z.enum(["low", "medium", "high"]),
  recentChemicalHistory: z.enum(["none", "perm", "color", "bleach", "multiple"]),
});

export type HairSurveyInput = z.infer<typeof hairSurveySchema>;

export const generateRequestSchema = z.object({
  selfieDataUrl: z
    .string()
    .max(MAX_IMAGE_DATA_URL_LENGTH, "image_too_large")
    .regex(IMAGE_DATA_URL_PATTERN, "invalid_image_data_url"),
  styleId: z.string().refine(isHairStyleId, "invalid_style_id"),
  survey: hairSurveySchema,
});

export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;

export const createCardRequestSchema = z.object({
  designerSlug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "invalid_designer_slug"),
  selfieDataUrl: generateRequestSchema.shape.selfieDataUrl,
  survey: hairSurveySchema,
  styleId: generateRequestSchema.shape.styleId,
  images: z
    .array(
      z.object({
        dataUrl: generateRequestSchema.shape.selfieDataUrl,
        label: z.string().min(1).max(80),
      })
    )
    .min(1)
    .max(3),
});

export type CreateCardRequestInput = z.infer<typeof createCardRequestSchema>;

export const designerResponseSchema = z.object({
  verdict: z.enum(["possible", "conditional", "difficult"]),
  notes: z.string().trim().max(2000).optional(),
});

export type DesignerResponseInput = z.infer<typeof designerResponseSchema>;
