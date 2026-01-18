import { wordEntryDraftSchema } from "../schemas/wordEntryDraft.schema";
import { KeyValueStorage, memoryStorage } from "../storage/kvStorage";
import { normalizeGerman } from "../utils/normalizeGerman";
import { getCachedDraft, setCachedDraft } from "./llmCache";
import { createDailyRateLimiter } from "./llmRateLimiter";
import { WordEntryDraft } from "../types/wordEntry";
import { resolveApiKey } from "./llmApiKey";

export type LlmCardGeneratorOptions = {
  inputLanguage: "de" | "en";
  userText: string;
  apiKey?: string;
  apiUrl?: string;
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
const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_RATE_LIMIT = 20;

const buildPrompt = (inputLanguage: "de" | "en", userText: string) => {
  const system =
    "You generate vocabulary flashcard data for German learners. Output must be valid JSON only. Follow schema strictly. Prefer common everyday meanings.";

  const user = [
    `Input: ${userText}`,
    `Input language: ${inputLanguage}`,
    "Return JSON in the following shape:",
    `{"german":"","english":"","partOfSpeech":"noun|verb|adj|other","article":"der|die|das|null","exampleDe":"","exampleEn":"","notes":""}`,
    "Rules:",
    "- If inputLanguage is 'de': treat input as German, translate to English.",
    "- If inputLanguage is 'en': produce most common German translation.",
    "- Infer partOfSpeech; if not noun, article must be null.",
    "- Keep example sentence short, A2-B1.",
    "- Avoid sensitive/personal content.",
    "- Output JSON only, no markdown.",
  ].join("\n");

  return { system, user };
};

const parseJson = (text: string) => {
  const trimmed = text.trim();
  return JSON.parse(trimmed) as unknown;
};

const normalizeDraft = (draft: WordEntryDraft): WordEntryDraft => {
  const german = normalizeGerman(draft.german);
  const english = draft.english.trim();
  const exampleDe = draft.exampleDe.trim();
  const exampleEn = draft.exampleEn.trim();
  const notes = draft.notes?.trim();

  return {
    ...draft,
    german,
    english,
    exampleDe,
    exampleEn,
    notes: notes ? notes : undefined,
  };
};

export const generateLlmCard = async (
  options: LlmCardGeneratorOptions
): Promise<LlmGeneratedDraft> => {
  const {
    inputLanguage,
    userText,
    apiKey,
    apiUrl = DEFAULT_API_URL,
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

  const key = resolveApiKey(apiKey);
  if (!key) {
    throw new Error("LLM API key not configured.");
  }

  const { system, user } = buildPrompt(inputLanguage, userText);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error("LLM request failed.");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response missing content.");
  }

  const parsed = parseJson(content);
  const validated = wordEntryDraftSchema.parse(parsed);
  const normalized = normalizeDraft(validated);

  const generated = {
    draft: normalized,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
    llmRawJson: content,
  };

  await limiter.increment();
  await setCachedDraft(storage, inputLanguage, userText, generated);

  return generated;
};
