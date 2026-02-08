import { getCachedImage, saveCachedImage } from "../storage/imageCacheStorage";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmImageGeneratorOptions = {
  german: string;
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
const IMAGE_ENDPOINT = "/api/llm/image";

export const generateLlmImage = async (
  options: LlmImageGeneratorOptions
): Promise<LlmImageResult> => {
  const {
    german,
    model = DEFAULT_IMAGE_MODEL,
    quality = DEFAULT_IMAGE_QUALITY,
    size = DEFAULT_IMAGE_SIZE,
    useCache = true,
  } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate an image.");
  }

  if (useCache) {
    const cached = getCachedImage(german, model);
    if (cached) {
      return cached;
    }
  }

  const endpoint = getLlmBackendEndpoint(IMAGE_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      german,
      model,
      quality,
      size,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Image generation failed"));
  }

  const payload = (await response.json()) as {
    imageUrl?: string;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  if (!payload.imageUrl) {
    throw new Error("Image response missing URL.");
  }

  const result = {
    imageUrl: payload.imageUrl,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };

  if (useCache) {
    saveCachedImage(german, result.llmModel, result);
  }

  return result;
};
