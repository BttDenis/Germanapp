import React, { useMemo, useState } from "react";

import { generateLlmCard } from "../services/llmCardGenerator";
import { WordEntryDraft } from "../types/wordEntry";

const emptyDraft: WordEntryDraft = {
  german: "",
  english: "",
  partOfSpeech: "other",
  article: null,
  exampleDe: "",
  exampleEn: "",
  notes: "",
  pronunciation: "",
  imagePrompt: "",
};

export const AddWordScreen = () => {
  const [inputText, setInputText] = useState("");
  const [inputLanguage, setInputLanguage] = useState<"de" | "en">("de");
  const [draft, setDraft] = useState<WordEntryDraft>(emptyDraft);
  const [llmMeta, setLlmMeta] = useState<{ model: string; generatedAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate = inputText.trim().length > 0 && !isGenerating;

  const handleGenerate = async (regenerate = false) => {
    setIsGenerating(true);
    setError(null);

    try {
      const generated = await generateLlmCard({
        inputLanguage,
        userText: inputText,
        regenerate,
      });
      setDraft(generated.draft);
      setLlmMeta({ model: generated.llmModel, generatedAt: generated.llmGeneratedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    const payload = {
      ...draft,
      source: llmMeta ? ("llm" as const) : ("manual" as const),
      llmGeneratedAt: llmMeta?.generatedAt ?? null,
      llmModel: llmMeta?.model ?? null,
    };

    void payload;
  };

  const notesValue = useMemo(() => draft.notes ?? "", [draft.notes]);

  return (
    <div>
      <h2>Add Word</h2>
      <label>
        Input language
        <select
          value={inputLanguage}
          onChange={(event) => setInputLanguage(event.target.value as "de" | "en")}
        >
          <option value="de">German</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        Word or phrase
        <input value={inputText} onChange={(event) => setInputText(event.target.value)} />
      </label>
      <p style={{ marginTop: 4, color: "#666" }}>
        Uses <code>VITE_LLM_API_KEY</code> from your environment to call the LLM.
      </p>
      <div>
        <button type="button" disabled={!canGenerate} onClick={() => handleGenerate(false)}>
          Generate Card
        </button>
        <button type="button" disabled={!canGenerate} onClick={() => handleGenerate(true)}>
          Regenerate
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <label>
          German
          <input
            value={draft.german}
            onChange={(event) => setDraft({ ...draft, german: event.target.value })}
          />
        </label>
        <label>
          English
          <input
            value={draft.english}
            onChange={(event) => setDraft({ ...draft, english: event.target.value })}
          />
        </label>
        <label>
          Part of speech
          <select
            value={draft.partOfSpeech}
            onChange={(event) =>
              setDraft({
                ...draft,
                partOfSpeech: event.target.value as WordEntryDraft["partOfSpeech"],
                article: event.target.value === "noun" ? draft.article : null,
              })
            }
          >
            <option value="noun">noun</option>
            <option value="verb">verb</option>
            <option value="adj">adj</option>
            <option value="other">other</option>
          </select>
        </label>
        <label>
          Article
          <select
            value={draft.article ?? ""}
            disabled={draft.partOfSpeech !== "noun"}
            onChange={(event) =>
              setDraft({
                ...draft,
                article:
                  event.target.value === "" ? null : (event.target.value as WordEntryDraft["article"]),
              })
            }
          >
            <option value="">none</option>
            <option value="der">der</option>
            <option value="die">die</option>
            <option value="das">das</option>
          </select>
        </label>
        <label>
          Example (DE)
          <input
            value={draft.exampleDe}
            onChange={(event) => setDraft({ ...draft, exampleDe: event.target.value })}
          />
        </label>
        <label>
          Example (EN)
          <input
            value={draft.exampleEn}
            onChange={(event) => setDraft({ ...draft, exampleEn: event.target.value })}
          />
        </label>
        <label>
          Notes
          <input
            value={notesValue}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>
        <label>
          Pronunciation
          <input
            value={draft.pronunciation ?? ""}
            onChange={(event) => setDraft({ ...draft, pronunciation: event.target.value })}
          />
        </label>
        <label>
          Image prompt
          <input
            value={draft.imagePrompt ?? ""}
            onChange={(event) => setDraft({ ...draft, imagePrompt: event.target.value })}
          />
        </label>
      </div>
      <button type="button" onClick={handleSave}>
        Save
      </button>
    </div>
  );
};
