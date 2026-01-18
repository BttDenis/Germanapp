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
  pronunciation?: string;
  imagePrompt?: string;
};

export type WordEntry = WordEntryDraft & {
  id: string;
  source: EntrySource;
  llmModel: string | null;
  llmGeneratedAt: string | null;
};
