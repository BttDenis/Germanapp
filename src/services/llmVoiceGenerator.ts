import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmVoiceGeneratorOptions = {
  german: string;
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
const DEFAULT_VOICE = "alloy";
const VOICE_ENDPOINT = "/api/llm/voice";

export const generateLlmVoice = async (
  options: LlmVoiceGeneratorOptions
): Promise<LlmVoiceResult> => {
  const { german, model = DEFAULT_TTS_MODEL, voice = DEFAULT_VOICE } = options;

  if (!german.trim()) {
    throw new Error("German word is required to generate audio.");
  }

  const endpoint = getLlmBackendEndpoint(VOICE_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      german,
      model,
      voice,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Audio generation failed"));
  }

  const payload = (await response.json()) as {
    audioUrl?: string;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  if (!payload.audioUrl) {
    throw new Error("Audio generation response missing URL.");
  }

  return {
    audioUrl: payload.audioUrl,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };
};
