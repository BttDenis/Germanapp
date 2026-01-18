import { KeyValueStorage } from "../storage/kvStorage";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

const getDayKey = () => new Date().toISOString().slice(0, 10);

export const createDailyRateLimiter = async (
  storage: KeyValueStorage,
  maxPerDay: number
): Promise<{
  check: () => Promise<RateLimitResult>;
  increment: () => Promise<RateLimitResult>;
}> => {
  const dayKey = getDayKey();
  const storageKey = `llm-rate-${dayKey}`;

  const readCount = async () => {
    const raw = await storage.getItem(storageKey);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resultFromCount = (count: number): RateLimitResult => {
    const remaining = Math.max(maxPerDay - count, 0);
    const resetAt = new Date(`${dayKey}T23:59:59.999Z`).toISOString();
    return {
      allowed: count < maxPerDay,
      remaining,
      resetAt,
    };
  };

  return {
    check: async () => resultFromCount(await readCount()),
    increment: async () => {
      const current = await readCount();
      const next = current + 1;
      await storage.setItem(storageKey, String(next));
      return resultFromCount(next);
    },
  };
};
