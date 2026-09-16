export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DATA_URL_LENGTH =
  Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100;

export const IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:jpeg|png|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

