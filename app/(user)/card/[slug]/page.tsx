import { notFound } from "next/navigation";
import { getHairStyleById } from "@/lib/styles";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  DAMAGE_LABELS,
  LENGTH_LABELS,
  TEXTURE_LABELS,
  VERDICT_LABELS,
} from "@/lib/survey-labels";

type StoredImage = { path: string; label: string };

export default async function CardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: card, error } = await supabase
    .from("consultation_cards")
    .select("slug,selfie_storage_path,survey,requested_style_id,generated_images,status,designer_verdict,designer_notes,designers(name,naver_booking_url)")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!card) notFound();

  const images = card.generated_images as StoredImage[];
  const signedImages = await Promise.all(
    images.map(async (image) => {
      const { data } = await supabase.storage.from("generated").createSignedUrl(image.path, 60 * 30);
      return { ...image, url: data?.signedUrl ?? null };
    })
  );
  const style = getHairStyleById(card.requested_style_id);
  const designer = Array.isArray(card.designers) ? card.designers[0] : card.designers;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-6">
      <div>
        <p className="text-sm text-neutral-500">상담 카드</p>
        <h1 className="text-2xl font-semibold">{style?.label ?? "선택한 스타일"}</h1>
        <p className="mt-1 text-sm text-neutral-600">{designer?.name ?? "디자이너"}에게 전달할 수 있어요.</p>
      </div>
      <section className="rounded-lg border border-neutral-200 p-4 text-sm">
        <p>현재 길이: {LENGTH_LABELS[(card.survey as { currentLength: string }).currentLength]}</p>
        <p>모발 질감: {TEXTURE_LABELS[(card.survey as { textureCurl: string }).textureCurl]}</p>
        <p>손상도: {DAMAGE_LABELS[(card.survey as { damageLevel: string }).damageLevel]}</p>
      </section>
      <div className="flex flex-col gap-4">
        {signedImages.map((image) => image.url && (
          <figure key={image.path} className="overflow-hidden rounded-lg border border-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.label} className="w-full object-cover" />
            <figcaption className="p-3 text-sm font-medium">{image.label}</figcaption>
          </figure>
        ))}
      </div>
      {card.status === "designer_responded" ? (
        <section className="rounded-lg bg-neutral-100 p-4 text-sm">
          <p className="font-medium">
            디자이너 의견: {card.designer_verdict ? VERDICT_LABELS[card.designer_verdict] : "-"}
          </p>
          {card.designer_notes && <p className="mt-2 whitespace-pre-wrap">{card.designer_notes}</p>}
        </section>
      ) : (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">디자이너 검토를 기다리고 있어요.</p>
      )}
      {designer?.naver_booking_url && (
        <a className="rounded-md bg-[#03c75a] px-4 py-3 text-center text-sm font-medium text-white" href={designer.naver_booking_url} target="_blank" rel="noreferrer">
          네이버 예약으로 이동
        </a>
      )}
    </main>
  );
}
