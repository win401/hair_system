const MAX_DIMENSION = 1024;
const MIN_PROCESSING_DIMENSION = 768;
const JPEG_QUALITY = 0.85;

export interface ResizedImageResult {
  dataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

export async function resizeImageFile(
  file: File,
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY
): Promise<ResizedImageResult> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const longestSide = Math.max(img.width, img.height);
  const scale =
    longestSide > maxDimension
      ? maxDimension / longestSide
      : longestSide < MIN_PROCESSING_DIMENSION
        ? MIN_PROCESSING_DIMENSION / longestSide
        : 1;
  const targetWidth = Math.round(img.width * scale);
  const targetHeight = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas_unsupported");
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    sourceWidth: img.width,
    sourceHeight: img.height,
    outputWidth: targetWidth,
    outputHeight: targetHeight,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = src;
  });
}
