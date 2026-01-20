const IMAGE_UPLOAD_URL = import.meta.env.VITE_IMAGE_UPLOAD_URL ?? "";
const IMAGE_UPLOAD_TOKEN = import.meta.env.VITE_IMAGE_UPLOAD_TOKEN ?? "";

type ImageUploadPayload = {
  dataUrl: string;
  german?: string;
  model?: string;
};

type ImageUploadResponse = {
  url?: string;
  imageUrl?: string;
  location?: string;
};

const buildHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (IMAGE_UPLOAD_TOKEN) {
    headers.Authorization = `Bearer ${IMAGE_UPLOAD_TOKEN}`;
  }

  return headers;
};

export const isImageUploadEnabled = () => Boolean(IMAGE_UPLOAD_URL);

export const uploadImageDataUrl = async (payload: ImageUploadPayload): Promise<string | null> => {
  if (!IMAGE_UPLOAD_URL) {
    return null;
  }

  const response = await fetch(IMAGE_UPLOAD_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Image upload failed (${response.status}).`);
  }

  const json = (await response.json()) as ImageUploadResponse;
  const url = json.url ?? json.imageUrl ?? json.location ?? null;
  if (!url) {
    throw new Error("Image upload response missing URL.");
  }

  return url;
};
