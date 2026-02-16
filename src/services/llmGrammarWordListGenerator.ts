import { GrammarLevel } from "../types/grammarPack";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmGrammarWordListOptions = {
  topic: string;
  details?: string;
  level?: GrammarLevel;
  count?: number;
  model?: string;
};

export type LlmGrammarWordListResult = {
  words: string[];
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const WORD_LIST_ENDPOINT = "/api/llm/grammar/words";

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();

export const generateLlmGrammarWordList = async (
  options: LlmGrammarWordListOptions
): Promise<LlmGrammarWordListResult> => {
  const {
    topic,
    details = "",
    level = "auto",
    count = 12,
    model = DEFAULT_MODEL,
  } = options;

  if (!normalizeText(topic)) {
    throw new Error("Topic is required to generate free words.");
  }

  const endpoint = getLlmBackendEndpoint(WORD_LIST_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      topic: normalizeText(topic),
      details: normalizeText(details),
      level,
      count,
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Word list generation failed"));
  }

  const payload = (await response.json()) as {
    words?: unknown;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  if (!Array.isArray(payload.words)) {
    throw new Error("Word list generation response missing words.");
  }

  const words = payload.words
    .map((word) => normalizeText(typeof word === "string" ? word : ""))
    .filter(Boolean)
    .slice(0, 40);

  if (words.length === 0) {
    throw new Error("Word list generation returned no words.");
  }

  return {
    words,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };
};
