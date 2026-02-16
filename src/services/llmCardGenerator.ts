import { wordEntryDraftSchema } from "../schemas/wordEntryDraft.schema";
import { KeyValueStorage, memoryStorage } from "../storage/kvStorage";
import { normalizeGerman } from "../utils/normalizeGerman";
import { getCachedDraft, setCachedDraft } from "./llmCache";
import { createDailyRateLimiter } from "./llmRateLimiter";
import { WordEntryDraft } from "../types/wordEntry";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmCardGeneratorOptions = {
  inputLanguage: "de" | "en";
  userText: string;
  model?: string;
  storage?: KeyValueStorage;
  rateLimitMaxPerDay?: number;
  regenerate?: boolean;
};

export type LlmGeneratedDraft = {
  draft: WordEntryDraft;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_RATE_LIMIT = 20;
const CARD_ENDPOINT = "/api/llm/card";

const normalizeOptionalText = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeDraft = (draft: WordEntryDraft): WordEntryDraft => {
  const german = normalizeGerman(draft.german);
  const english = draft.english.trim();
  const sense = draft.sense?.trim();
  const exampleDe = draft.exampleDe.trim();
  const exampleEn = draft.exampleEn.trim();
  const notes = draft.notes?.trim();
  const partOfSpeech = draft.partOfSpeech;

  const nounPlural = partOfSpeech === "noun" ? normalizeOptionalText(draft.nounPlural) : null;
  const nounGenitive = partOfSpeech === "noun" ? normalizeOptionalText(draft.nounGenitive) : null;
  const verbThirdPerson = partOfSpeech === "verb" ? normalizeOptionalText(draft.verbThirdPerson) : null;
  const verbPast = partOfSpeech === "verb" ? normalizeOptionalText(draft.verbPast) : null;
  const verbParticipleIi =
    partOfSpeech === "verb" ? normalizeOptionalText(draft.verbParticipleIi) : null;
  const verbAuxiliary =
    partOfSpeech === "verb" && (draft.verbAuxiliary === "haben" || draft.verbAuxiliary === "sein")
      ? draft.verbAuxiliary
      : null;
  const adjectiveComparative =
    partOfSpeech === "adj" ? normalizeOptionalText(draft.adjectiveComparative) : null;
  const adjectiveSuperlative =
    partOfSpeech === "adj" ? normalizeOptionalText(draft.adjectiveSuperlative) : null;

  return {
    ...draft,
    german,
    english,
    sense: sense ? sense : undefined,
    exampleDe,
    exampleEn,
    notes: notes ? notes : undefined,
    nounPlural,
    nounGenitive,
    verbThirdPerson,
    verbPast,
    verbParticipleIi,
    verbAuxiliary,
    adjectiveComparative,
    adjectiveSuperlative,
  };
};

export const generateLlmCard = async (
  options: LlmCardGeneratorOptions
): Promise<LlmGeneratedDraft> => {
  const {
    inputLanguage,
    userText,
    model = DEFAULT_MODEL,
    storage = memoryStorage(),
    rateLimitMaxPerDay = DEFAULT_RATE_LIMIT,
    regenerate = false,
  } = options;

  if (!userText.trim()) {
    throw new Error("Input text is required.");
  }

  if (!regenerate) {
    const cached = await getCachedDraft(storage, inputLanguage, userText);
    if (cached) {
      return cached;
    }
  }

  const limiter = await createDailyRateLimiter(storage, rateLimitMaxPerDay);
  const rateCheck = await limiter.check();
  if (!rateCheck.allowed) {
    throw new Error("Daily generation limit reached.");
  }

  const endpoint = getLlmBackendEndpoint(CARD_ENDPOINT);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      inputLanguage,
      userText,
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "LLM request failed"));
  }

  const payload = (await response.json()) as {
    draft?: unknown;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  if (!payload.draft) {
    throw new Error("LLM response missing draft.");
  }

  const validated = wordEntryDraftSchema.parse(payload.draft);
  const normalized = normalizeDraft(validated);

  const generated = {
    draft: normalized,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };

  await limiter.increment();
  await setCachedDraft(storage, inputLanguage, userText, generated);

  return generated;
};
