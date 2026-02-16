import { SavedGrammarPack } from "../types/grammarPack";
import { KeyValueStorage, memoryStorage } from "./kvStorage";

const STORAGE_KEY = "germanapp.grammarPacks";
const MAX_PACKS = 40;

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

const parsePacks = (payload: string | null): SavedGrammarPack[] => {
  if (!payload) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as SavedGrammarPack[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistPacks = (packs: SavedGrammarPack[]) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(packs));
};

export const getSavedGrammarPacks = (): SavedGrammarPack[] => {
  return parsePacks(storage.getItem(STORAGE_KEY));
};

export const saveGrammarPack = (pack: SavedGrammarPack) => {
  const existing = getSavedGrammarPacks().filter((item) => item.id !== pack.id);
  const next = [pack, ...existing].slice(0, MAX_PACKS);
  persistPacks(next);
  return next;
};

export const deleteGrammarPack = (id: string) => {
  const next = getSavedGrammarPacks().filter((item) => item.id !== id);
  persistPacks(next);
  return next;
};
