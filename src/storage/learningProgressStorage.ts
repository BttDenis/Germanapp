import { KeyValueStorage, memoryStorage } from "./kvStorage";

export type LearningProgressEntry = {
  entryId: string;
  strength: number;
  correctStreak: number;
  totalReviews: number;
  correctReviews: number;
  lastReviewedAt: string | null;
};

const STORAGE_KEY = "germanapp.learningProgress";

const getStorage = (): KeyValueStorage => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage();
};

const storage = getStorage();

const parseProgress = (payload: string | null): Record<string, LearningProgressEntry> => {
  if (!payload) {
    return {};
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, LearningProgressEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const persistProgress = (progress: Record<string, LearningProgressEntry>) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
};

export const getLearningProgress = (): Record<string, LearningProgressEntry> => {
  return parseProgress(storage.getItem(STORAGE_KEY));
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

export const updateLearningProgress = (entryId: string, isCorrect: boolean) => {
  const progress = getLearningProgress();
  const current = progress[entryId] ?? {
    entryId,
    strength: 35,
    correctStreak: 0,
    totalReviews: 0,
    correctReviews: 0,
    lastReviewedAt: null,
  };

  const nextCorrectStreak = isCorrect ? current.correctStreak + 1 : 0;
  const delta = isCorrect ? 12 + nextCorrectStreak * 2 : -18;

  const nextEntry: LearningProgressEntry = {
    ...current,
    strength: clamp(current.strength + delta, 0, 100),
    correctStreak: nextCorrectStreak,
    totalReviews: current.totalReviews + 1,
    correctReviews: current.correctReviews + (isCorrect ? 1 : 0),
    lastReviewedAt: new Date().toISOString(),
  };

  const nextProgress = {
    ...progress,
    [entryId]: nextEntry,
  };

  persistProgress(nextProgress);
  return nextProgress;
};
