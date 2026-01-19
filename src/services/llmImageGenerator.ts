import { getCachedImage, saveCachedImage } from "../storage/imageCacheStorage";
import { resolveApiKey } from "./llmApiKey";

export type LlmImageGeneratorOptions = {
  german: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  quality?: "low" | "medium" | "high";
  size?: "256x256" | "512x512" | "1024x1024";
  useCache?: boolean;
};

export type LlmImageResult = {
  imageUrl: string;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_IMAGE_MODEL = "gpt-image-1-mini";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_API_URL = "https://api.openai.com/v1/images/generations";

const buildPrompt = (german: string) =>
  `Create a clean, friendly illustration that represents the German word or phrase: "${german}". Avoid text, logos, or watermarks.`;

const formatErrorDetails = async (response: Response) => {
  const statusLabel = `${response.status} ${response.statusText}`.trim();

  try {
    const text = await response.text();
    if (!text) {
      return statusLabel;
    }

    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      const message = parsed?.error?.message ?? parsed?.message;
      if (message) {
        return `${statusLabel} - ${message}`;
      }
    } catch {
      return `${statusLabel} - ${text}`;
    }

    return `${statusLabel} - ${text}`;
  } catch {
    return statusLabel;
  }
};

export const generateLlmImage = async (
  options: LlmImageGeneratorOptions
): Promise<LlmImageResult> => {
  const {
    german,
    apiKey,
    apiUrl = DEFAULT_API_URL,
    model = DEFAULT_IMAGE_MODEL,
    quality = DEFAULT_IMAGE_QUALITY,
    size = DEFAULT_IMAGE_SIZE,
    useCache = true,
  } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate an image.");
  }

  const key = resolveApiKey(apiKey);
  if (!key) {
    throw new Error("LLM API key not configured.");
  }

  if (useCache) {
    const cached = getCachedImage(german, model);
    if (cached) {
      return cached;
    }
  }

  const requestImage = async (payload: Record<string, string>) =>
    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

  const basePayload = {
    model,
    prompt: buildPrompt(german),
    quality,
    size,
  };

  let response = await requestImage({ ...basePayload, response_format: "url" });
  if (!response.ok) {
    const details = await formatErrorDetails(response);
    const shouldRetry = details.toLowerCase().includes("unknown parameter") && details.includes("response_format");
    if (shouldRetry) {
      response = await requestImage(basePayload);
    } else {
      throw new Error(`Image generation failed (${details}).`);
    }
  }

  if (!response.ok) {
    const details = await formatErrorDetails(response);
    throw new Error(`Image generation failed (${details}).`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const data = payload.data?.[0];
  if (!data) {
    throw new Error("Image response missing data.");
  }

  const inlineImageUrl = data.b64_json ? `data:image/png;base64,${data.b64_json}` : null;
  if (!inlineImageUrl && !data.url) {
    throw new Error("Image response missing URL.");
  }

  const imageUrl = data.url ?? inlineImageUrl ?? "";

  const result = {
    imageUrl,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
    llmRawJson: JSON.stringify(payload),
  };

  if (useCache) {
    saveCachedImage(german, model, result);
  }

  return result;
};
