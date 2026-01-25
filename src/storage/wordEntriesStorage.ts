import { KeyValueStorage, memoryStorage } from "./kvStorage";
import { WordEntry, WordEntryInput } from "../types/wordEntry";

export const WORD_ENTRIES_STORAGE_KEY = "germanapp.wordEntries";
export const WORD_ENTRIES_CLIENT_ID_KEY = "germanapp.clientId";

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

export const getClientId = () => {
  const existing = storage.getItem(WORD_ENTRIES_CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }
  const generated = `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage.setItem(WORD_ENTRIES_CLIENT_ID_KEY, generated);
  return generated;
};

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

const isDataUrl = (value?: string | null) => Boolean(value && value.startsWith("data:"));

const stripEntryMedia = (entry: WordEntry): WordEntry => {
  if (!isDataUrl(entry.imageUrl) && !isDataUrl(entry.audioUrl)) {
    return entry;
  }
  return {
    ...entry,
    imageUrl: isDataUrl(entry.imageUrl) ? null : entry.imageUrl ?? null,
    audioUrl: isDataUrl(entry.audioUrl) ? null : entry.audioUrl ?? null,
  };
};

const stripEntriesMedia = (entries: WordEntry[]) => entries.map((entry) => stripEntryMedia(entry));

const persistEntries = (entries: WordEntry[]): WordEntry[] => {
  try {
    storage.setItem(WORD_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
    return entries;
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error;
    }
  }

  const strippedEntries = stripEntriesMedia(entries);
  try {
    storage.setItem(WORD_ENTRIES_STORAGE_KEY, JSON.stringify(strippedEntries));
    return strippedEntries;
  } catch (error) {
    if (!isQuotaError(error)) {
      throw error;
    }
  }

  const trimmed = [...strippedEntries];
  while (trimmed.length > 0) {
    trimmed.pop();
    try {
      storage.setItem(WORD_ENTRIES_STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch (error) {
      if (!isQuotaError(error)) {
        throw error;
      }
    }
  }

  if (storage.removeItem) {
    storage.removeItem(WORD_ENTRIES_STORAGE_KEY);
  } else {
    storage.setItem(WORD_ENTRIES_STORAGE_KEY, JSON.stringify([]));
  }
  return [];
};

export const getWordEntries = (): WordEntry[] => {
  return parseEntries(storage.getItem(WORD_ENTRIES_STORAGE_KEY));
};

export const setWordEntries = (entries: WordEntry[]) => {
  return persistEntries(entries);
};

const stampEntryMetadata = (entry: WordEntry, clientId = getClientId()) => {
  return {
    ...entry,
    updatedAt: new Date().toISOString(),
    clientId,
  };
};

export const updateWordEntry = (nextEntry: WordEntry) => {
  const entries = getWordEntries();
  const stamped = stampEntryMetadata(nextEntry);
  const nextEntries = entries.map((entry) => (entry.id === stamped.id ? stamped : entry));
  return persistEntries(nextEntries);
};

export const deleteWordEntry = (entryId: string) => {
  const entries = getWordEntries();
  const nextEntries = entries.filter((entry) => entry.id !== entryId);
  return persistEntries(nextEntries);
};

const normalizeImportedEntry = (entry: Partial<WordEntry>): WordEntry | null => {
  if (!entry.german || !entry.english) {
    return null;
  }
  return {
    id: entry.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    german: entry.german,
    english: entry.english,
    sense: entry.sense ?? "",
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
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
    clientId: entry.clientId ?? "import",
  };
};

const compareTimestamp = (left?: string | null, right?: string | null) => {
  const leftDate = left ? Date.parse(left) : 0;
  const rightDate = right ? Date.parse(right) : 0;
  return leftDate - rightDate;
};

export const mergeWordEntries = (incoming: Partial<WordEntry>[]) => {
  const existingEntries = getWordEntries();
  const existingKeys = new Set(existingEntries.map((entry) => getEntryKey(entry)));
  const existingByKey = new Map(existingEntries.map((entry) => [getEntryKey(entry), entry]));
  const normalizedIncoming = incoming
    .map((entry) => normalizeImportedEntry(entry))
    .filter((entry): entry is WordEntry => Boolean(entry));

  const uniqueIncoming: WordEntry[] = [];
  normalizedIncoming.forEach((entry) => {
    const key = getEntryKey(entry);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      uniqueIncoming.push(entry);
      return;
    }
    const existingEntry = existingByKey.get(key);
    if (!existingEntry) {
      return;
    }
    const isIncomingNewer = compareTimestamp(entry.updatedAt, existingEntry.updatedAt) > 0;
    const nextEntry: WordEntry = {
      ...existingEntry,
      updatedAt: isIncomingNewer ? entry.updatedAt : existingEntry.updatedAt,
      clientId: isIncomingNewer ? entry.clientId : existingEntry.clientId,
      article: existingEntry.article ?? entry.article ?? null,
      exampleDe: existingEntry.exampleDe || entry.exampleDe,
      exampleEn: existingEntry.exampleEn || entry.exampleEn,
      sense: existingEntry.sense || entry.sense,
      notes: existingEntry.notes || entry.notes,
      imageUrl: existingEntry.imageUrl ?? entry.imageUrl ?? null,
      audioUrl: existingEntry.audioUrl ?? entry.audioUrl ?? null,
      llmModel: existingEntry.llmModel ?? entry.llmModel ?? null,
      llmGeneratedAt: existingEntry.llmGeneratedAt ?? entry.llmGeneratedAt ?? null,
      source: existingEntry.source ?? entry.source ?? "manual",
    };
    existingByKey.set(key, nextEntry);
  });

  const merged = [
    ...uniqueIncoming,
    ...existingEntries.map((entry) => existingByKey.get(getEntryKey(entry)) ?? entry),
  ];
  const saved = setWordEntries(merged);
  return { added: uniqueIncoming.length, total: saved.length };
};

export const saveWordEntry = (input: WordEntryInput): WordEntry => {
  const entries = getWordEntries();
  const nextEntry: WordEntry = {
    ...input,
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    updatedAt: new Date().toISOString(),
    clientId: getClientId(),
  };
  const saved = persistEntries([nextEntry, ...entries]);
  return saved.find((entry) => entry.id === nextEntry.id) ?? nextEntry;
};

export const saveWordEntries = (inputs: WordEntryInput[]): WordEntry[] => {
  const entries = getWordEntries();
  const timestamp = Date.now();
  const clientId = getClientId();
  const nextEntries = inputs.map((input, index) => ({
    ...input,
    id: `entry-${timestamp}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    updatedAt: new Date().toISOString(),
    clientId,
  }));
  const saved = persistEntries([...nextEntries, ...entries]);
  const savedById = new Map(saved.map((entry) => [entry.id, entry]));
  return nextEntries.map((entry) => savedById.get(entry.id) ?? entry);
};

export const clearWordEntries = () => {
  if (storage.removeItem) {
    storage.removeItem(WORD_ENTRIES_STORAGE_KEY);
  } else {
    persistEntries([]);
  }
};
