import { NextResponse } from "next/server";
import { generateRequestSchema } from "@/lib/validation";
import { getHairstyleGenerator } from "@/lib/ai/adapter";
import { MAX_IMAGE_DATA_URL_LENGTH } from "@/lib/image-constraints";
import { validateImageDataUrl } from "@/lib/server/validate-image-data-url";

const MAX_REQUEST_BYTES = MAX_IMAGE_DATA_URL_LENGTH + 10_000;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "request_too_large", message: "사진 용량이 너무 큽니다." },
      { status: 413 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!validateImageDataUrl(parsed.data.selfieDataUrl)) {
    return NextResponse.json(
      { error: "invalid_image", message: "유효한 사진 파일이 아닙니다." },
      { status: 400 }
    );
  }

  try {
    const generator = getHairstyleGenerator();
    const images = await generator.generateHairstyle({
      selfieDataUrl: parsed.data.selfieDataUrl,
      styleId: parsed.data.styleId,
      survey: parsed.data.survey,
      variantCount: 1,
    });
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json(
      {
        error: "generation_failed",
        message: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 502 }
    );
  }
}
