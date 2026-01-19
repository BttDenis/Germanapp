import React, { useEffect, useMemo, useState } from "react";

import { generateLlmCard } from "../services/llmCardGenerator";
import { generateLlmImage } from "../services/llmImageGenerator";
import { generateLlmVoice } from "../services/llmVoiceGenerator";
import { getEntryKey, getWordEntries, saveWordEntry } from "../storage/wordEntriesStorage";
import { WordEntry, WordEntryDraft, WordEntryInput } from "../types/wordEntry";
import { buildCommonWordEntries, COMMON_WORD_BATCH_SIZE } from "../utils/commonWordSeed";
import "./AddWordScreen.css";

const emptyDraft: WordEntryDraft = {
  german: "",
  english: "",
  partOfSpeech: "other",
  article: null,
  exampleDe: "",
  exampleEn: "",
  notes: "",
  imageUrl: null,
  audioUrl: null,
};

type AddWordScreenProps = {
  onEntrySaved?: (entry: WordEntry) => void;
  onBatchEntrySaved?: (entry: WordEntry) => void;
};

export const AddWordScreen = ({ onEntrySaved, onBatchEntrySaved }: AddWordScreenProps) => {
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
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
    currentWord: string;
  } | null>(null);

  const canGenerate = inputText.trim().length > 0 && !isGenerating && !isBatchGenerating;
  const needsApiKey =
    error?.includes("LLM API key not configured") || mediaError?.includes("LLM API key not configured");

  const handleGenerate = async (regenerate = false) => {
    setIsGenerating(true);
    setError(null);
    setMediaError(null);
    setImageState(null);
    setAudioState(null);

    try {
      const generated = await generateLlmCard({
        inputLanguage,
        userText: inputText,
        regenerate,
      });
      setDraft(generated.draft);
      setLlmMeta({ model: generated.llmModel, generatedAt: generated.llmGeneratedAt });

      const [imageResult, voiceResult] = await Promise.allSettled([
        generateLlmImage({ german: generated.draft.german }),
        generateLlmVoice({ german: generated.draft.german }),
      ]);

      const mediaErrors: string[] = [];

      if (imageResult.status === "fulfilled") {
        const image = imageResult.value;
        setImageState({ url: image.imageUrl, model: image.llmModel, generatedAt: image.llmGeneratedAt });
      } else {
        mediaErrors.push(
          `Image: ${imageResult.reason instanceof Error ? imageResult.reason.message : "generation failed"}.`
        );
      }

      if (voiceResult.status === "fulfilled") {
        const voice = voiceResult.value;
        setAudioState({ url: voice.audioUrl, model: voice.llmModel, generatedAt: voice.llmGeneratedAt });
      } else {
        mediaErrors.push(
          `Audio: ${voiceResult.reason instanceof Error ? voiceResult.reason.message : "generation failed"}.`
        );
      }

      if (mediaErrors.length > 0) {
        setMediaError(mediaErrors.join(" "));
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
      imageUrl: imageState?.url ?? null,
      audioUrl: audioState?.url ?? null,
      source: llmMeta ? ("llm" as const) : ("manual" as const),
      llmGeneratedAt: llmMeta?.generatedAt ?? null,
      llmModel: llmMeta?.model ?? null,
    };

    const savedEntry = saveWordEntry(payload);
    setSaveMessage(`Saved "${payload.german || payload.english}" to your dictionary.`);
    onEntrySaved?.(savedEntry);
    setBatchMessage(null);
  };

  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    setSaveMessage(null);
    setBatchMessage(null);
    setBatchError(null);

    const savedEntries = getWordEntries();
    const existingKeys = new Set(savedEntries.map((entry) => getEntryKey(entry)));
    const allEntries = buildCommonWordEntries();
    const baseEntries = allEntries.filter((entry) => !existingKeys.has(getEntryKey(entry)));
    const skippedCount = allEntries.length - baseEntries.length;
    if (baseEntries.length === 0) {
      setBatchMessage("All common words are already in your dictionary.");
      setIsBatchGenerating(false);
      return;
    }

    setBatchProgress({ completed: 0, total: baseEntries.length, currentWord: baseEntries[0].german });

    const enrichedEntries: WordEntryInput[] = [];
    const mediaFailures: string[] = [];

    try {
      for (let index = 0; index < baseEntries.length; index += 1) {
        const baseEntry = baseEntries[index];
        setBatchProgress({
          completed: index,
          total: baseEntries.length,
          currentWord: baseEntry.german,
        });

        const [imageResult, voiceResult] = await Promise.allSettled([
          generateLlmImage({ german: baseEntry.german }),
          generateLlmVoice({ german: baseEntry.german }),
        ]);

        const nextEntry: WordEntryInput = {
          ...baseEntry,
          imageUrl: baseEntry.imageUrl ?? null,
          audioUrl: baseEntry.audioUrl ?? null,
          source: "llm" as const,
        };

        if (imageResult.status === "fulfilled") {
          nextEntry.imageUrl = imageResult.value.imageUrl;
        } else {
          mediaFailures.push(
            `Image for "${baseEntry.german}" failed: ${
              imageResult.reason instanceof Error ? imageResult.reason.message : "generation failed"
            }.`
          );
        }

        if (voiceResult.status === "fulfilled") {
          nextEntry.audioUrl = voiceResult.value.audioUrl;
        } else {
          mediaFailures.push(
            `Audio for "${baseEntry.german}" failed: ${
              voiceResult.reason instanceof Error ? voiceResult.reason.message : "generation failed"
            }.`
          );
        }

        enrichedEntries.push(nextEntry);
        const savedEntry = saveWordEntry(nextEntry);
        onBatchEntrySaved?.(savedEntry);
        setBatchProgress({
          completed: index + 1,
          total: baseEntries.length,
          currentWord: baseEntry.german,
        });
      }

      const skippedNote = skippedCount > 0 ? ` Skipped ${skippedCount} already saved word(s).` : "";
      setBatchMessage(`Added ${enrichedEntries.length} common words with images and audio.${skippedNote}`);

      if (mediaFailures.length > 0) {
        setBatchError(mediaFailures.join(" "));
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch generation failed.");
    } finally {
      setIsBatchGenerating(false);
      setBatchProgress(null);
    }
  };

  const notesValue = useMemo(() => draft.notes ?? "", [draft.notes]);
  const hasGeneratedCard = Boolean(draft.german || draft.english);

  useEffect(() => {
    return () => {
      if (audioState?.url?.startsWith("blob:")) {
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

      <section className="add-word-screen__panel">
        <div className="add-word-screen__batch">
          <div>
            <p className="add-word-screen__eyebrow">Quick start</p>
            <h3>Generate {COMMON_WORD_BATCH_SIZE} common words</h3>
            <p className="add-word-screen__subhead">
              Add a ready-made set of the most common words to your dictionary in one click.
            </p>
          </div>
          <button type="button" className="primary" onClick={handleBatchGenerate} disabled={isBatchGenerating}>
            {isBatchGenerating ? "Generating..." : `Add ${COMMON_WORD_BATCH_SIZE} words`}
          </button>
        </div>
        {batchProgress ? (
          <div className="add-word-screen__batch-progress" role="status" aria-live="polite">
            <div className="add-word-screen__progressbar">
              <span
                style={{
                  width: `${Math.min((batchProgress.completed / batchProgress.total) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="add-word-screen__progress-meta">
              <span>
                Generating {batchProgress.completed}/{batchProgress.total}
              </span>
              <span>Working on "{batchProgress.currentWord}"</span>
            </div>
          </div>
        ) : null}
        {batchMessage ? <p className="add-word-screen__success">{batchMessage}</p> : null}
        {batchError ? <p className="add-word-screen__error" role="alert">{batchError}</p> : null}
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
