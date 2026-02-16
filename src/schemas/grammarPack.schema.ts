import { z } from "zod";

export const grammarTableSchema = z.object({
  title: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).default([]),
});

export const grammarExerciseSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
  sentenceTemplate: z.string().min(1),
  baseWord: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
  topicTag: z.string().min(1),
});

export const grammarPackSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  ruleSummary: z.array(z.string().min(1)).default([]),
  tables: z.array(grammarTableSchema).default([]),
  exercises: z.array(grammarExerciseSchema).default([]),
  studyTips: z.array(z.string().min(1)).default([]),
});

export type GrammarPackSchema = z.infer<typeof grammarPackSchema>;
