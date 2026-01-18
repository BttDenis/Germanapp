import { KeyValueStorage, memoryStorage } from "./kvStorage";

export type CachedImage = {
  imageUrl: string;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const STORAGE_KEY = "germanapp.imageCache";

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

const getCacheKey = (german: string, model: string) =>
  `${german.trim().toLowerCase()}::${model.trim().toLowerCase()}`;

const parseCache = (payload: string | null): Record<string, CachedImage> => {
  if (!payload) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload) as Record<string, CachedImage>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const readCache = (): Record<string, CachedImage> => parseCache(storage.getItem(STORAGE_KEY));

const persistCache = (cache: Record<string, CachedImage>) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(cache));
};

export const getCachedImage = (german: string, model: string): CachedImage | null => {
  const cache = readCache();
  return cache[getCacheKey(german, model)] ?? null;
};

export const saveCachedImage = (german: string, model: string, image: CachedImage) => {
  const cache = readCache();
  cache[getCacheKey(german, model)] = image;
  persistCache(cache);
};
