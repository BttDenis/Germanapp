import { resolveApiKey } from "./llmApiKey";

export type LlmImageGeneratorOptions = {
  german: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
};

export type LlmImageResult = {
  imageUrl: string;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
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
  } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate an image.");
  }

  const key = resolveApiKey(apiKey);
  if (!key) {
    throw new Error("LLM API key not configured.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt: buildPrompt(german),
      size: "1024x1024",
    }),
  });

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

  const imageUrl = data.url ?? (data.b64_json ? `data:image/png;base64,${data.b64_json}` : null);
  if (!imageUrl) {
    throw new Error("Image response missing URL.");
  }

  return {
    imageUrl,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
    llmRawJson: JSON.stringify(payload),
  };
};
