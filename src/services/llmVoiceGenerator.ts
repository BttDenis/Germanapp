import { resolveApiKey } from "./llmApiKey";

export type LlmVoiceGeneratorOptions = {
  german: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  voice?: string;
};

export type LlmVoiceResult = {
  audioUrl: string;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_API_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_VOICE = "alloy";

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

export const generateLlmVoice = async (
  options: LlmVoiceGeneratorOptions
): Promise<LlmVoiceResult> => {
  const {
    german,
    apiKey,
    apiUrl = DEFAULT_API_URL,
    model = DEFAULT_TTS_MODEL,
    voice = DEFAULT_VOICE,
  } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate audio.");
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
      input: german,
      voice,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const details = await formatErrorDetails(response);
    throw new Error(`Audio generation failed (${details}).`);
  }

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);

  return {
    audioUrl,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
  };
};
