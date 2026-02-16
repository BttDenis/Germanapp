import { grammarPackSchema } from "../schemas/grammarPack.schema";
import { GrammarLevel, GrammarPack } from "../types/grammarPack";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmGrammarGeneratorOptions = {
  topic: string;
  details?: string;
  level?: GrammarLevel;
  formatHint?: string;
  model?: string;
};

export type LlmGrammarResult = {
  pack: GrammarPack;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const GRAMMAR_ENDPOINT = "/api/llm/grammar";

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();

export const generateLlmGrammarPack = async (
  options: LlmGrammarGeneratorOptions
): Promise<LlmGrammarResult> => {
  const {
    topic,
    details = "",
    level = "auto",
    formatHint = "",
    model = DEFAULT_MODEL,
  } = options;

  if (!normalizeText(topic)) {
    throw new Error("Topic is required.");
  }

  const endpoint = getLlmBackendEndpoint(GRAMMAR_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      topic: normalizeText(topic),
      details: normalizeText(details),
      level,
      formatHint: normalizeText(formatHint),
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Grammar generation failed"));
  }

  const payload = (await response.json()) as {
    pack?: unknown;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  if (!payload.pack) {
    throw new Error("Grammar generation response missing pack.");
  }

  const validated = grammarPackSchema.parse(payload.pack);
  return {
    pack: validated,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };
};
