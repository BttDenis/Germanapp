import { KeyValueStorage, memoryStorage } from "./kvStorage";

export type CachedImage = {
  imageUrl: string;
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
  lastAccessed?: number;
  approxBytes?: number;
};

const STORAGE_KEY = "germanapp.imageCache";
const MAX_CACHE_ENTRIES = 60;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

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

const estimateEntryBytes = (entry: CachedImage) => {
  const payload = JSON.stringify(entry);
  return payload.length * 2;
};

const normalizeCacheEntry = (entry: CachedImage): CachedImage => {
  const lastAccessed = entry.lastAccessed ?? Date.now();
  const approxBytes = entry.approxBytes ?? estimateEntryBytes({ ...entry, lastAccessed });
  return { ...entry, lastAccessed, approxBytes };
};

const pruneCache = (cache: Record<string, CachedImage>) => {
  const entries = Object.entries(cache).map(([key, entry]) => [
    key,
    normalizeCacheEntry(entry),
  ]) as Array<[string, CachedImage]>;

  let totalBytes = entries.reduce((sum, [, entry]) => sum + (entry.approxBytes ?? 0), 0);
  entries.sort(([, a], [, b]) => (a.lastAccessed ?? 0) - (b.lastAccessed ?? 0));

  while (entries.length > MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_BYTES) {
    const removed = entries.shift();
    if (!removed) {
      break;
    }
    const [key, entry] = removed;
    totalBytes -= entry.approxBytes ?? 0;
    delete cache[key];
  }
};


export const getCachedImage = (german: string, model: string): CachedImage | null => {
  const cache = readCache();
  const key = getCacheKey(german, model);
  const cached = cache[key];
  if (!cached) {
    return null;
  }
  cache[key] = normalizeCacheEntry({ ...cached, lastAccessed: Date.now() });
  try {
    persistCache(cache);
  } catch {
    // Ignore write failures during read paths.
  }
  return cache[key];
};

export const saveCachedImage = (german: string, model: string, image: CachedImage) => {
  const cache = readCache();
  const key = getCacheKey(german, model);
  cache[key] = normalizeCacheEntry({ ...image, lastAccessed: Date.now() });
  pruneCache(cache);
  try {
    persistCache(cache);
  } catch (error) {
    try {
      if (storage.removeItem) {
        storage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage cleanup failures.
    }
    if (error instanceof Error) {
      console.warn("Image cache storage failed; cache cleared.", error);
    }
  }
};
