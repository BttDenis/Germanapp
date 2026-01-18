import React, { useEffect, useMemo, useState } from "react";

import { generateLlmCard } from "../services/llmCardGenerator";
import { generateLlmImage } from "../services/llmImageGenerator";
import { generateLlmVoice } from "../services/llmVoiceGenerator";
import { saveWordEntry } from "../storage/wordEntriesStorage";
import { WordEntry, WordEntryDraft } from "../types/wordEntry";
import "./AddWordScreen.css";

const emptyDraft: WordEntryDraft = {
  german: "",
  english: "",
  partOfSpeech: "other",
  article: null,
  exampleDe: "",
  exampleEn: "",
  notes: "",
};

type AddWordScreenProps = {
  onEntrySaved?: (entry: WordEntry) => void;
};

export const AddWordScreen = ({ onEntrySaved }: AddWordScreenProps) => {
  const [inputText, setInputText] = useState("");
  const [inputLanguage, setInputLanguage] = useState<"de" | "en">("de");
  const [draft, setDraft] = useState<WordEntryDraft>(emptyDraft);
  const [llmMeta, setLlmMeta] = useState<{ model: string; generatedAt: string } | null>(null);
  const [imageState, setImageState] = useState<{
    url: string;
    model: string;
    generatedAt: string;
  } | null>(null);
  const [audioState, setAudioState] = useState<{
    url: string;
    model: string;
    generatedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const canGenerate = inputText.trim().length > 0 && !isGenerating;
  const needsApiKey =
    error?.includes("LLM API key not configured") || mediaError?.includes("LLM API key not configured");

  const handleGenerate = async (regenerate = false) => {
    setIsGenerating(true);
    setError(null);
    setMediaError(null);

    try {
      const generated = await generateLlmCard({
        inputLanguage,
        userText: inputText,
        regenerate,
      });
      setDraft(generated.draft);
      setLlmMeta({ model: generated.llmModel, generatedAt: generated.llmGeneratedAt });

      try {
        const [image, voice] = await Promise.all([
          generateLlmImage({ german: generated.draft.german }),
          generateLlmVoice({ german: generated.draft.german }),
        ]);
        setImageState({ url: image.imageUrl, model: image.llmModel, generatedAt: image.llmGeneratedAt });
        setAudioState({ url: voice.audioUrl, model: voice.llmModel, generatedAt: voice.llmGeneratedAt });
      } catch (mediaErr) {
        setMediaError(mediaErr instanceof Error ? mediaErr.message : "Media generation failed.");
      }
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

    const savedEntry = saveWordEntry(payload);
    setSaveMessage(`Saved "${payload.german || payload.english}" to your dictionary.`);
    onEntrySaved?.(savedEntry);
  };

  const notesValue = useMemo(() => draft.notes ?? "", [draft.notes]);
  const hasGeneratedCard = Boolean(draft.german || draft.english);

  useEffect(() => {
    return () => {
      if (audioState?.url) {
        URL.revokeObjectURL(audioState.url);
      }
    };
  }, [audioState?.url]);

  return (
    <div className="add-word-screen">
      <header className="add-word-screen__header">
        <div>
          <p className="add-word-screen__eyebrow">Start here</p>
          <h2>Add Word</h2>
          <p className="add-word-screen__subhead">
            Generate a card with pronunciation and a matching illustration. Edit anything before saving.
          </p>
        </div>
      </header>

      <section className="add-word-screen__panel">
        <div className="add-word-screen__inputs">
          <label className="field">
            <span>Input language</span>
            <select
              value={inputLanguage}
              onChange={(event) => setInputLanguage(event.target.value as "de" | "en")}
            >
              <option value="de">German</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field field--stretch">
            <span>Word or phrase</span>
            <input value={inputText} onChange={(event) => setInputText(event.target.value)} />
          </label>
        </div>
        <div className="add-word-screen__actions">
          <button type="button" disabled={!canGenerate} onClick={() => handleGenerate(false)}>
            {isGenerating ? "Generating..." : "Generate Card"}
          </button>
          <button type="button" className="ghost" disabled={!canGenerate} onClick={() => handleGenerate(true)}>
            Regenerate
          </button>
        </div>
        {error ? <p className="add-word-screen__error" role="alert">{error}</p> : null}
        {mediaError ? <p className="add-word-screen__error" role="alert">{mediaError}</p> : null}
      </section>

      {hasGeneratedCard ? (
        <section className="add-word-screen__preview">
          <div className="preview-card">
            <div className="preview-card__image">
              {imageState?.url ? (
                <img src={imageState.url} alt={`Illustration for ${draft.german}`} />
              ) : (
                <div className="preview-card__placeholder">Illustration will appear here</div>
              )}
            </div>
            <div className="preview-card__content">
              <div className="preview-card__title">
                <span className="preview-card__german">{draft.article ? `${draft.article} ${draft.german}` : draft.german}</span>
                <span className="preview-card__english">{draft.english}</span>
              </div>
              <div className="preview-card__meta">
                <span>{draft.partOfSpeech}</span>
                {llmMeta ? <span>LLM: {llmMeta.model}</span> : null}
              </div>
              <div className="preview-card__audio">
                <span>Pronunciation</span>
                {audioState?.url ? (
                  <audio controls src={audioState.url} />
                ) : (
                  <p className="preview-card__hint">Audio will appear after generation.</p>
                )}
              </div>
              <div className="preview-card__examples">
                <h3>Usage examples</h3>
                <p>{draft.exampleDe}</p>
                <p className="preview-card__translation">{draft.exampleEn}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="add-word-screen__panel">
        <h3>Edit details</h3>
        <div className="add-word-screen__form-grid">
          <label className="field">
            <span>German</span>
            <input
              value={draft.german}
              onChange={(event) => setDraft({ ...draft, german: event.target.value })}
            />
          </label>
          <label className="field">
            <span>English</span>
            <input
              value={draft.english}
              onChange={(event) => setDraft({ ...draft, english: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Part of speech</span>
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
          <label className="field">
            <span>Article</span>
            <select
              value={draft.article ?? ""}
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
          <label className="field">
            <span>Usage example (DE)</span>
            <input
              value={draft.exampleDe}
              onChange={(event) => setDraft({ ...draft, exampleDe: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Usage example (EN)</span>
            <input
              value={draft.exampleEn}
              onChange={(event) => setDraft({ ...draft, exampleEn: event.target.value })}
            />
          </label>
          <label className="field field--full">
            <span>Notes</span>
            <input
              value={notesValue}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </label>
        </div>
        <button type="button" className="primary" onClick={handleSave}>
          Save word
        </button>
        {saveMessage ? <p className="add-word-screen__success">{saveMessage}</p> : null}
      </section>
    </div>
  );
};
