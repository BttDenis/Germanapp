import { z } from "zod";

const partOfSpeech = z.enum(["noun", "verb", "adj", "other"]);
const article = z.enum(["der", "die", "das"]).nullable();

export const wordEntryDraftSchema = z
  .object({
    german: z.string().min(1),
    english: z.string().min(1),
    partOfSpeech,
    article,
    exampleDe: z.string().min(1),
    exampleEn: z.string().min(1),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (data) => (data.partOfSpeech === "noun" ? data.article !== null : data.article === null),
    {
      message: "Article must be set only for nouns.",
      path: ["article"],
    }
  );

export type WordEntryDraftSchema = z.infer<typeof wordEntryDraftSchema>;
