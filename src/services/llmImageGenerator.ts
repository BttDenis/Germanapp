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
const MAX_INLINE_IMAGE_BYTES = 900_000;
const MAX_IMAGE_DIMENSION = 768;

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

const estimateDataUrlBytes = (dataUrl: string) => {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Math.floor((base64.length * 3) / 4);
};

const createOptimizedDataUrl = async (dataUrl: string): Promise<string> => {
  if (typeof window === "undefined") {
    return dataUrl;
  }
  if (!dataUrl.startsWith("data:")) {
    return dataUrl;
  }
  if (estimateDataUrlBytes(dataUrl) <= MAX_INLINE_IMAGE_BYTES) {
    return dataUrl;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image optimization failed."));
    img.src = dataUrl;
  });

  const { width, height } = image;
  if (!width || !height) {
    return dataUrl;
  }

  const maxDimension = Math.max(width, height);
  if (maxDimension <= MAX_IMAGE_DIMENSION) {
    return dataUrl;
  }

  const scale = MAX_IMAGE_DIMENSION / maxDimension;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return dataUrl;
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const mimeTypes = ["image/webp", "image/jpeg"];
  const qualitySteps = [0.82, 0.7, 0.6];

  for (const type of mimeTypes) {
    for (const quality of qualitySteps) {
      const candidate = canvas.toDataURL(type, quality);
      if (estimateDataUrlBytes(candidate) <= MAX_INLINE_IMAGE_BYTES) {
        return candidate;
      }
    }
  }

  const fallback = canvas.toDataURL("image/jpeg", 0.6);
  return estimateDataUrlBytes(fallback) <= estimateDataUrlBytes(dataUrl) ? fallback : dataUrl;
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

  const resolveDataUrl = async (url: string) => {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      throw new Error(`Image download failed (${imageResponse.status}).`);
    }
    const blob = await imageResponse.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Image conversion failed."));
        }
      };
      reader.onerror = () => reject(new Error("Image conversion failed."));
      reader.readAsDataURL(blob);
    });
  };

  let response = await requestImage({ ...basePayload, response_format: "b64_json" });
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

  let inlineImageUrl = data.b64_json ? `data:image/png;base64,${data.b64_json}` : null;
  if (inlineImageUrl) {
    try {
      inlineImageUrl = await createOptimizedDataUrl(inlineImageUrl);
    } catch {
      inlineImageUrl = inlineImageUrl;
    }
  }
  if (!inlineImageUrl && data.url) {
    try {
      inlineImageUrl = await resolveDataUrl(data.url);
      if (inlineImageUrl) {
        inlineImageUrl = await createOptimizedDataUrl(inlineImageUrl);
      }
    } catch {
      inlineImageUrl = null;
    }
  }
  if (!inlineImageUrl && !data.url) {
    throw new Error("Image response missing URL.");
  }

  const imageUrl = inlineImageUrl ?? data.url ?? "";

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
