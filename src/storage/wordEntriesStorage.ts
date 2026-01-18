import { KeyValueStorage, memoryStorage } from "./kvStorage";
import { WordEntry, WordEntryInput } from "../types/wordEntry";

const STORAGE_KEY = "germanapp.wordEntries";

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

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

const persistEntries = (entries: WordEntry[]) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const getWordEntries = (): WordEntry[] => {
  return parseEntries(storage.getItem(STORAGE_KEY));
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
