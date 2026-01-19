import { KeyValueStorage, memoryStorage } from "./kvStorage";
import { WordEntry, WordEntryInput } from "../types/wordEntry";

export const WORD_ENTRIES_STORAGE_KEY = "germanapp.wordEntries";

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

const normalizeValue = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export const getEntryKey = (entry: Pick<WordEntry, "german" | "english" | "partOfSpeech">) => {
  return `${normalizeValue(entry.german)}|${normalizeValue(entry.english)}|${normalizeValue(entry.partOfSpeech)}`;
};

const parseEntries = (payload: string | null): WordEntry[] => {
  if (!payload) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as WordEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isQuotaError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
};

const persistEntries = (entries: WordEntry[]) => {
  const payload = JSON.stringify(entries);
  try {
    storage.setItem(WORD_ENTRIES_STORAGE_KEY, payload);
    return;
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error;
    }
  }

  const trimmedEntries = [...entries];
  while (trimmedEntries.length > 0) {
    trimmedEntries.pop();
    try {
      storage.setItem(WORD_ENTRIES_STORAGE_KEY, JSON.stringify(trimmedEntries));
      return;
    } catch (error) {
      if (!isQuotaError(error)) {
        throw error;
      }
    }
  }
};

export const getWordEntries = (): WordEntry[] => {
  return parseEntries(storage.getItem(WORD_ENTRIES_STORAGE_KEY));
};

export const setWordEntries = (entries: WordEntry[]) => {
  persistEntries(entries);
};

const normalizeImportedEntry = (entry: Partial<WordEntry>): WordEntry | null => {
  if (!entry.german || !entry.english) {
    return null;
  }
  return {
    id: entry.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    german: entry.german,
    english: entry.english,
    partOfSpeech: entry.partOfSpeech ?? "other",
    article: entry.article ?? null,
    exampleDe: entry.exampleDe ?? "",
    exampleEn: entry.exampleEn ?? "",
    notes: entry.notes ?? "",
    imageUrl: entry.imageUrl ?? null,
    audioUrl: entry.audioUrl ?? null,
    source: entry.source ?? "manual",
    llmModel: entry.llmModel ?? null,
    llmGeneratedAt: entry.llmGeneratedAt ?? null,
  };
};

export const mergeWordEntries = (incoming: Partial<WordEntry>[]) => {
  const existingEntries = getWordEntries();
  const existingKeys = new Set(existingEntries.map((entry) => getEntryKey(entry)));
  const normalizedIncoming = incoming
    .map((entry) => normalizeImportedEntry(entry))
    .filter((entry): entry is WordEntry => Boolean(entry));

  const uniqueIncoming: WordEntry[] = [];
  normalizedIncoming.forEach((entry) => {
    const key = getEntryKey(entry);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      uniqueIncoming.push(entry);
    }
  });

  const merged = [...uniqueIncoming, ...existingEntries];
  setWordEntries(merged);
  return { added: uniqueIncoming.length, total: merged.length };
};

export const saveWordEntry = (input: WordEntryInput): WordEntry => {
  const entries = getWordEntries();
  const nextEntry: WordEntry = {
    ...input,
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  persistEntries([nextEntry, ...entries]);
  return nextEntry;
};

export const saveWordEntries = (inputs: WordEntryInput[]): WordEntry[] => {
  const entries = getWordEntries();
  const timestamp = Date.now();
  const nextEntries = inputs.map((input, index) => ({
    ...input,
    id: `entry-${timestamp}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  }));
  persistEntries([...nextEntries, ...entries]);
  return nextEntries;
};

export const clearWordEntries = () => {
  if (storage.removeItem) {
    storage.removeItem(WORD_ENTRIES_STORAGE_KEY);
  } else {
    persistEntries([]);
  }
};
