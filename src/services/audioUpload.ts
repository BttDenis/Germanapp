const AUDIO_UPLOAD_URL = import.meta.env.VITE_AUDIO_UPLOAD_URL ?? "";
const AUDIO_UPLOAD_TOKEN = import.meta.env.VITE_AUDIO_UPLOAD_TOKEN ?? "";

type AudioUploadPayload = {
  dataUrl: string;
  german?: string;
  model?: string;
};

type AudioUploadResponse = {
  url?: string;
  audioUrl?: string;
  location?: string;
};

const buildHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (AUDIO_UPLOAD_TOKEN) {
    headers.Authorization = `Bearer ${AUDIO_UPLOAD_TOKEN}`;
  }

  return headers;
};

export const isAudioUploadEnabled = () => Boolean(AUDIO_UPLOAD_URL);

export const uploadAudioDataUrl = async (payload: AudioUploadPayload): Promise<string | null> => {
  if (!AUDIO_UPLOAD_URL) {
    return null;
  }

  const response = await fetch(AUDIO_UPLOAD_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Audio upload failed (${response.status}).`);
  }

  const json = (await response.json()) as AudioUploadResponse;
  const url = json.url ?? json.audioUrl ?? json.location ?? null;
  if (!url) {
    throw new Error("Audio upload response missing URL.");
  }

  return url;
};
