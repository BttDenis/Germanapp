import { getCachedImage, saveCachedImage } from "../storage/imageCacheStorage";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmImageCardContext = {
  english?: string | null;
  sense?: string | null;
  partOfSpeech?: "noun" | "verb" | "adj" | "other" | null;
  article?: "der" | "die" | "das" | null;
  exampleDe?: string | null;
  exampleEn?: string | null;
  notes?: string | null;
};

export type LlmImageGeneratorOptions = {
  german: string;
  context?: LlmImageCardContext;
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

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();

const buildImageContextKey = (context: LlmImageCardContext | undefined): string =>
  JSON.stringify({
    english: normalizeText(context?.english),
    sense: normalizeText(context?.sense),
    partOfSpeech: context?.partOfSpeech ?? "",
    article: context?.article ?? "",
    exampleDe: normalizeText(context?.exampleDe),
    exampleEn: normalizeText(context?.exampleEn),
    notes: normalizeText(context?.notes),
  });

export const generateLlmImage = async (
  options: LlmImageGeneratorOptions
): Promise<LlmImageResult> => {
  const {
    german,
    context,
    model = DEFAULT_IMAGE_MODEL,
    quality = DEFAULT_IMAGE_QUALITY,
    size = DEFAULT_IMAGE_SIZE,
    useCache = true,
  } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate an image.");
  }

  const contextKey = buildImageContextKey(context);

  if (useCache) {
    const cached = getCachedImage(german, model, contextKey);
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
      english: context?.english,
      sense: context?.sense,
      partOfSpeech: context?.partOfSpeech,
      article: context?.article,
      exampleDe: context?.exampleDe,
      exampleEn: context?.exampleEn,
      notes: context?.notes,
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
    saveCachedImage(german, result.llmModel, result, contextKey);
  }

  return result;
};
