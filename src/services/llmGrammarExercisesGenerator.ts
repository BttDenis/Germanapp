import { z } from "zod";

import { grammarExerciseSchema } from "../schemas/grammarPack.schema";
import { GrammarExercise, GrammarLevel } from "../types/grammarPack";
import { buildLlmBackendHeaders, getLlmBackendEndpoint, parseErrorMessage } from "./llmBackendClient";

export type LlmGrammarExercisesGeneratorOptions = {
  topic: string;
  details?: string;
  level?: GrammarLevel;
  wordSource?: "dictionary" | "free";
  dictionaryWords?: string[];
  freeWords?: string[];
  existingExercises?: GrammarExercise[];
  count?: number;
  model?: string;
};

export type LlmGrammarExercisesResult = {
  exercises: GrammarExercise[];
  llmModel: string;
  llmGeneratedAt: string;
  llmRawJson?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const GRAMMAR_EXERCISES_ENDPOINT = "/api/llm/grammar/exercises";

const normalizeText = (value: string | null | undefined) => (value ?? "").trim();
const exercisesSchema = z.array(grammarExerciseSchema);

export const generateLlmGrammarExercises = async (
  options: LlmGrammarExercisesGeneratorOptions
): Promise<LlmGrammarExercisesResult> => {
  const {
    topic,
    details = "",
    level = "auto",
    wordSource = "dictionary",
    dictionaryWords = [],
    freeWords = [],
    existingExercises = [],
    count = 6,
    model = DEFAULT_MODEL,
  } = options;

  if (!normalizeText(topic)) {
    throw new Error("Topic is required.");
  }

  const endpoint = getLlmBackendEndpoint(GRAMMAR_EXERCISES_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildLlmBackendHeaders(),
    body: JSON.stringify({
      topic: normalizeText(topic),
      details: normalizeText(details),
      level,
      wordSource,
      dictionaryWords: dictionaryWords.map((word) => normalizeText(word)).filter(Boolean),
      freeWords: freeWords.map((word) => normalizeText(word)).filter(Boolean),
      existingExercises,
      count,
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Grammar exercise generation failed"));
  }

  const payload = (await response.json()) as {
    exercises?: unknown;
    llmModel?: string;
    llmGeneratedAt?: string;
    llmRawJson?: string;
  };

  const exercises = exercisesSchema.parse(payload.exercises ?? []);
  return {
    exercises,
    llmModel: payload.llmModel ?? model,
    llmGeneratedAt: payload.llmGeneratedAt ?? new Date().toISOString(),
    llmRawJson: payload.llmRawJson,
  };
};
