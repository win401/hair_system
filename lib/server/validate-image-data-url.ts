import "server-only";

import {
  IMAGE_DATA_URL_PATTERN,
  MAX_IMAGE_BYTES,
} from "@/lib/image-constraints";

type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp";

interface ValidImageData {
  mimeType: SupportedMimeType;
  byteLength: number;
}

export function validateImageDataUrl(dataUrl: string): ValidImageData | null {
  if (!IMAGE_DATA_URL_PATTERN.test(dataUrl)) return null;

  const commaIndex = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(";")) as SupportedMimeType;
  const encoded = dataUrl.slice(commaIndex + 1);

  try {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    if (!matchesMimeSignature(bytes, mimeType)) return null;
    return { mimeType, byteLength: bytes.length };
  } catch {
    return null;
  }
}

function matchesMimeSignature(
  bytes: Buffer,
  mimeType: SupportedMimeType
): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return (
      bytes.length >= pngSignature.length &&
      pngSignature.every((value, index) => bytes[index] === value)
    );
  }

  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

