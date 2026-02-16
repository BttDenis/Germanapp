export type GrammarLevel = "auto" | "A1-A2" | "B1" | "B2-C1";

export type GrammarTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type GrammarExercise = {
  id: string;
  instruction: string;
  sentenceTemplate: string;
  baseWord: string;
  acceptedAnswers: string[];
  explanation: string;
  topicTag: string;
};

export type GrammarPack = {
  title: string;
  topic: string;
  ruleSummary: string[];
  tables: GrammarTable[];
  exercises: GrammarExercise[];
  studyTips: string[];
};

export type SavedGrammarPack = {
  id: string;
  createdAt: string;
  llmModel: string | null;
  llmGeneratedAt: string | null;
  pack: GrammarPack;
};
