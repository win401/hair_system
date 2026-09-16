import "server-only";

import { validateImageDataUrl } from "@/lib/server/validate-image-data-url";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function toBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function uploadPrivateImage({
  bucket,
  path,
  dataUrl,
}: {
  bucket: "selfies" | "generated";
  path: string;
  dataUrl: string;
}) {
  const image = validateImageDataUrl(dataUrl);
  if (!image) throw new Error("유효한 사진 파일이 아닙니다.");

  const fullPath = `${path}.${extensionFor(image.mimeType)}`;
  const { error } = await getSupabaseAdmin().storage.from(bucket).upload(
    fullPath,
    toBuffer(dataUrl),
    { contentType: image.mimeType, upsert: false }
  );
  if (error) throw new Error(`사진 저장에 실패했어요: ${error.message}`);
  return fullPath;
}

export async function removePrivateImages(
  entries: { bucket: "selfies" | "generated"; path: string }[]
) {
  const client = getSupabaseAdmin();
  await Promise.all(
    (["selfies", "generated"] as const).map(async (bucket) => {
      const paths = entries.filter((entry) => entry.bucket === bucket).map((entry) => entry.path);
      if (paths.length) await client.storage.from(bucket).remove(paths);
    })
  );
}
