import { notFound } from "next/navigation";
import { getHairStyleById } from "@/lib/styles";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  CHEMICAL_LABELS,
  DAMAGE_LABELS,
  LENGTH_LABELS,
  TEXTURE_LABELS,
} from "@/lib/survey-labels";
import { DesignerResponseForm } from "./DesignerResponseForm";

type StoredImage = { path: string; label: string };
type Survey = {
  currentLength: string;
  textureCurl: string;
  damageLevel: string;
  recentChemicalHistory: string;
};

export default async function DesignerRespondPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();
  const { data: card, error } = await supabase
    .from("consultation_cards")
    .select(
      "selfie_storage_path,survey,requested_style_id,generated_images,status,designer_verdict,designer_notes,designers(name)"
    )
    .eq("designer_response_token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!card) notFound();

  const images = card.generated_images as StoredImage[];
  const signedImages = await Promise.all(
    images.map(async (image) => {
      const { data } = await supabase.storage
        .from("generated")
        .createSignedUrl(image.path, 60 * 30);
      return { ...image, url: data?.signedUrl ?? null };
    })
  );

  let selfieUrl: string | null = null;
  if (card.selfie_storage_path) {
    const { data } = await supabase.storage
      .from("selfies")
      .createSignedUrl(card.selfie_storage_path, 60 * 30);
    selfieUrl = data?.signedUrl ?? null;
  }

  const style = getHairStyleById(card.requested_style_id);
  const survey = card.survey as Survey;
  const designer = Array.isArray(card.designers) ? card.designers[0] : card.designers;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-6">
      <div>
        <p className="text-sm text-neutral-500">디자이너 상담 카드</p>
        <h1 className="text-2xl font-semibold">{style?.label ?? "선택한 스타일"}</h1>
        {designer?.name && (
          <p className="mt-1 text-sm text-neutral-600">
            {designer.name}님에게 온 상담 요청이에요.
          </p>
        )}
      </div>

      {selfieUrl && (
        <div>
          <p className="mb-2 text-sm font-medium">고객 원본 사진</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selfieUrl}
            alt="고객 원본 사진"
            className="h-48 w-48 rounded-lg object-cover"
          />
        </div>
      )}

      <section className="rounded-lg border border-neutral-200 p-4 text-sm">
        <p>현재 길이: {LENGTH_LABELS[survey.currentLength] ?? survey.currentLength}</p>
        <p>모발 질감: {TEXTURE_LABELS[survey.textureCurl] ?? survey.textureCurl}</p>
        <p>손상도: {DAMAGE_LABELS[survey.damageLevel] ?? survey.damageLevel}</p>
        <p>
          최근 시술 이력:{" "}
          {CHEMICAL_LABELS[survey.recentChemicalHistory] ?? survey.recentChemicalHistory}
        </p>
      </section>

      <div className="flex flex-col gap-4">
        {signedImages.map(
          (image) =>
            image.url && (
              <figure
                key={image.path}
                className="overflow-hidden rounded-lg border border-neutral-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.label} className="w-full object-cover" />
                <figcaption className="p-3 text-sm font-medium">{image.label}</figcaption>
              </figure>
            )
        )}
      </div>

      <DesignerResponseForm
        token={token}
        initialVerdict={card.designer_verdict}
        initialNotes={card.designer_notes}
        alreadyResponded={card.status === "designer_responded"}
      />
    </main>
  );
}
