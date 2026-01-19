import { commonWords } from "../data/commonWords";
import { WordEntryInput } from "../types/wordEntry";

export const COMMON_WORD_BATCH_SIZE = 10;

export const buildCommonWordEntries = (
  limit: number = COMMON_WORD_BATCH_SIZE
): WordEntryInput[] => {
  const baseTime = new Date().toISOString();
  return commonWords.slice(0, limit).map((word) => ({
    german: word.german,
    english: word.english,
    partOfSpeech: word.partOfSpeech,
    article: word.article,
    exampleDe: `Ich lerne das Wort "${word.german}".`,
    exampleEn: `I am learning the word "${word.english}".`,
    notes: "Seeded from common words list.",
    imageUrl: null,
    audioUrl: null,
    source: "manual" as const,
    llmGeneratedAt: baseTime,
    llmModel: "common-words-seed",
  }));
};
