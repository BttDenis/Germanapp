import { KeyValueStorage } from "../storage/kvStorage";
import { WordEntryDraft } from "../types/wordEntry";

export type CachedDraft = {
  draft: WordEntryDraft;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const cacheKey = (inputLanguage: "de" | "en", text: string) =>
  `llm-draft-${inputLanguage}-${text.trim().toLowerCase()}`;

export const getCachedDraft = async (
  storage: KeyValueStorage,
  inputLanguage: "de" | "en",
  text: string
): Promise<CachedDraft | null> => {
  const key = cacheKey(inputLanguage, text);
  const raw = await storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CachedDraft;
  } catch {
    return null;
  }
};

export const setCachedDraft = async (
  storage: KeyValueStorage,
  inputLanguage: "de" | "en",
  text: string,
  value: CachedDraft
) => {
  const key = cacheKey(inputLanguage, text);
  await storage.setItem(key, JSON.stringify(value));
};
