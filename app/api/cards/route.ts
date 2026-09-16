import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createCardRequestSchema } from "@/lib/validation";
import { validateImageDataUrl } from "@/lib/server/validate-image-data-url";
import { removePrivateImages, uploadPrivateImage } from "@/lib/server/card-storage";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createCardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  if (
    !validateImageDataUrl(parsed.data.selfieDataUrl) ||
    parsed.data.images.some((image) => !validateImageDataUrl(image.dataUrl))
  ) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: designer, error: designerError } = await supabase
    .from("designers")
    .select("id")
    .eq("slug", parsed.data.designerSlug)
    .maybeSingle();

  if (designerError) throw new Error(designerError.message);
  if (!designer) {
    return NextResponse.json({ error: "designer_not_found" }, { status: 404 });
  }

  const cardId = nanoid(18);
  const uploaded: { bucket: "selfies" | "generated"; path: string }[] = [];
  try {
    const selfiePath = await uploadPrivateImage({
      bucket: "selfies",
      path: `cards/${cardId}/selfie`,
      dataUrl: parsed.data.selfieDataUrl,
    });
    uploaded.push({ bucket: "selfies", path: selfiePath });

    const generatedImages = await Promise.all(
      parsed.data.images.map(async (image, index) => {
        const path = await uploadPrivateImage({
          bucket: "generated",
          path: `cards/${cardId}/result-${index + 1}`,
          dataUrl: image.dataUrl,
        });
        uploaded.push({ bucket: "generated", path });
        return { path, label: image.label };
      })
    );

    const slug = nanoid(14);
    const designerResponseToken = nanoid(32);
    const { error: insertError } = await supabase.from("consultation_cards").insert({
      slug,
      designer_response_token: designerResponseToken,
      designer_id: designer.id,
      selfie_storage_path: selfiePath,
      survey: parsed.data.survey,
      requested_style_id: parsed.data.styleId,
      generation_status: "succeeded",
      generated_images: generatedImages,
    });
    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ slug }, { status: 201 });
  } catch (error) {
    await removePrivateImages(uploaded);
    return NextResponse.json(
      { error: "card_creation_failed", message: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
