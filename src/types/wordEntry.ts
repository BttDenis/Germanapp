export type PartOfSpeech = "noun" | "verb" | "adj" | "other";
export type Article = "der" | "die" | "das" | null;
export type EntrySource = "manual" | "llm";

export type WordEntryDraft = {
  german: string;
  english: string;
  partOfSpeech: PartOfSpeech;
  article: Article;
  exampleDe: string;
  exampleEn: string;
  notes?: string;
  imageUrl?: string | null;
};

export type WordEntryInput = WordEntryDraft & {
  source: EntrySource;
  llmModel: string | null;
  llmGeneratedAt: string | null;
};

export type WordEntry = WordEntryDraft & {
  id: string;
  source: EntrySource;
  llmModel: string | null;
  llmGeneratedAt: string | null;
};
