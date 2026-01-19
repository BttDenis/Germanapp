import { commonWords } from "../data/commonWords";
import { normalizeGerman } from "./normalizeGerman";

export const COMMON_WORD_BATCH_SIZE = 10;

export const pickRandomCommonWords = (
  limit: number = COMMON_WORD_BATCH_SIZE,
  excludedGerman: Set<string> = new Set()
) => {
  const available = commonWords.filter(
    (word) => !excludedGerman.has(normalizeGerman(word.german).toLowerCase())
  );

  if (available.length <= limit) {
    return { selected: available, availableCount: available.length };
  }

  const shuffled = [...available];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return { selected: shuffled.slice(0, limit), availableCount: available.length };
};
