import { useEffect, useMemo, useState } from "react";

import { commonWords } from "../data/commonWords";
import { generateLlmCard } from "../services/llmCardGenerator";
import { generateLlmImage } from "../services/llmImageGenerator";
import { generateLlmVoice } from "../services/llmVoiceGenerator";
import { getWordEntries, saveWordEntry, saveWordEntries } from "../storage/wordEntriesStorage";
import { WordEntry, WordEntryDraft, WordEntryInput } from "../types/wordEntry";
import { pickRandomCommonWords, COMMON_WORD_BATCH_SIZE } from "../utils/commonWordSeed";
import { normalizeGerman } from "../utils/normalizeGerman";
import "./AddWordScreen.css";

const emptyDraft: WordEntryDraft = {
  german: "",
  english: "",
  sense: "",
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

type BatchQueueItem = {
  id: string;
  entry: WordEntryInput;
  status: "pending" | "saved" | "skipped";
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
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);

  const canGenerate = inputText.trim().length > 0 && !isGenerating && !isBatchGenerating;
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

  const updateBatchQueueEntry = (id: string, updates: Partial<WordEntryInput>) => {
    setBatchQueue((current) =>
      current.map((item) =>
        item.id === id ? { ...item, entry: { ...item.entry, ...updates } } : item
      )
    );
  };

  const handleApproveQueueItem = (id: string) => {
    setBatchQueue((current) => {
      const item = current.find((queueItem) => queueItem.id === id);
      if (!item || item.status !== "pending") {
        return current;
      }
      const savedEntry = saveWordEntry(item.entry);
      onBatchEntrySaved?.(savedEntry);
      return current.map((queueItem) =>
        queueItem.id === id ? { ...queueItem, status: "saved" } : queueItem
      );
    });
  };

  const handleSkipQueueItem = (id: string) => {
    setBatchQueue((current) =>
      current.map((queueItem) =>
        queueItem.id === id ? { ...queueItem, status: "skipped" } : queueItem
      )
    );
  };

  const handleApproveAllQueueItems = () => {
    setBatchQueue((current) => {
      const pendingItems = current.filter((item) => item.status === "pending");
      if (pendingItems.length === 0) {
        return current;
      }
      const savedEntries = saveWordEntries(pendingItems.map((item) => item.entry));
      savedEntries.forEach((entry) => onBatchEntrySaved?.(entry));
      return current.map((item) =>
        item.status === "pending" ? { ...item, status: "saved" } : item
      );
    });
  };

  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    setSaveMessage(null);
    setBatchMessage(null);
    setBatchError(null);
    setBatchQueue([]);

    const savedEntries = getWordEntries();
    const existingGerman = new Set(
      savedEntries.map((entry) => normalizeGerman(entry.german).toLowerCase())
    );
    const { selected: baseEntries, availableCount } = pickRandomCommonWords(
      COMMON_WORD_BATCH_SIZE,
      existingGerman
    );
    const skippedCount = Math.max(commonWords.length - availableCount, 0);
    if (baseEntries.length === 0) {
      setBatchMessage("All common words are already in your dictionary.");
      setIsBatchGenerating(false);
      return;
    }

    setBatchProgress({ completed: 0, total: baseEntries.length, currentWord: baseEntries[0].german });

    const queuedEntries: BatchQueueItem[] = [];
    const mediaFailures: string[] = [];

    try {
      for (let index = 0; index < baseEntries.length; index += 1) {
        const baseEntry = baseEntries[index];
        setBatchProgress({
          completed: index,
          total: baseEntries.length,
          currentWord: baseEntry.german,
        });

        const generated = await generateLlmCard({
          inputLanguage: "de",
          userText: baseEntry.german,
        });

        const [imageResult, voiceResult] = await Promise.allSettled([
          generateLlmImage({ german: generated.draft.german }),
          generateLlmVoice({ german: generated.draft.german }),
        ]);

        const nextEntry: WordEntryInput = {
          ...generated.draft,
          sense: generated.draft.sense ?? "",
          imageUrl: null,
          audioUrl: null,
          source: "llm" as const,
          llmGeneratedAt: generated.llmGeneratedAt,
          llmModel: generated.llmModel,
        };

        if (imageResult.status === "fulfilled") {
          nextEntry.imageUrl = imageResult.value.imageUrl;
        } else {
          mediaFailures.push(
            `Image for "${generated.draft.german}" failed: ${
              imageResult.reason instanceof Error ? imageResult.reason.message : "generation failed"
            }.`
          );
        }

        if (voiceResult.status === "fulfilled") {
          nextEntry.audioUrl = voiceResult.value.audioUrl;
        } else {
          mediaFailures.push(
            `Audio for "${generated.draft.german}" failed: ${
              voiceResult.reason instanceof Error ? voiceResult.reason.message : "generation failed"
            }.`
          );
        }

        queuedEntries.push({
          id: `queue-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          entry: nextEntry,
          status: "pending",
        });
        setBatchProgress({
          completed: index + 1,
          total: baseEntries.length,
          currentWord: generated.draft.german,
        });
      }

      const skippedNote = skippedCount > 0 ? ` Skipped ${skippedCount} already saved word(s).` : "";
      setBatchQueue(queuedEntries);
      setBatchMessage(`Generated ${queuedEntries.length} cards. Review and approve to save.${skippedNote}`);

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
  const senseValue = useMemo(() => draft.sense ?? "", [draft.sense]);
  const hasGeneratedCard = Boolean(draft.german || draft.english);
  const pendingBatchCount = batchQueue.filter((item) => item.status === "pending").length;
  const savedBatchCount = batchQueue.filter((item) => item.status === "saved").length;
  const skippedBatchCount = batchQueue.filter((item) => item.status === "skipped").length;

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

      {batchQueue.length > 0 ? (
        <section className="add-word-screen__panel">
          <div className="add-word-screen__queue-header">
            <div>
              <p className="add-word-screen__eyebrow">Review queue</p>
              <h3>Preview generated cards</h3>
              <p className="add-word-screen__subhead">
                Approve or edit each entry before it is saved to your dictionary.
              </p>
            </div>
            <div className="add-word-screen__queue-actions">
              <span className="add-word-screen__queue-count">
                {pendingBatchCount} pending
                {savedBatchCount ? ` · ${savedBatchCount} saved` : ""}
                {skippedBatchCount ? ` · ${skippedBatchCount} skipped` : ""}
              </span>
              <button
                type="button"
                className="primary"
                onClick={handleApproveAllQueueItems}
                disabled={pendingBatchCount === 0}
              >
                Approve all pending
              </button>
            </div>
          </div>
          <div className="add-word-screen__queue-list">
            {batchQueue.map((item) => (
              <article className={`queue-card queue-card--${item.status}`} key={item.id}>
                <div className="queue-card__media">
                  {item.entry.imageUrl ? (
                    <img src={item.entry.imageUrl} alt={`Illustration for ${item.entry.german}`} />
                  ) : (
                    <div className="queue-card__placeholder">No illustration yet</div>
                  )}
                </div>
                <div className="queue-card__body">
                  <div className="queue-card__status">
                    <span>{item.status === "pending" ? "Pending approval" : item.status}</span>
                    {item.entry.llmModel ? <span>LLM: {item.entry.llmModel}</span> : null}
                  </div>
                  <div className="queue-card__form">
                    <label className="field">
                      <span>German</span>
                      <input
                        value={item.entry.german}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { german: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>English</span>
                      <input
                        value={item.entry.english}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { english: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Sense</span>
                      <input
                        value={item.entry.sense ?? ""}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { sense: event.target.value })
                        }
                        placeholder="e.g. riverbank"
                      />
                    </label>
                    <label className="field">
                      <span>Part of speech</span>
                      <select
                        value={item.entry.partOfSpeech}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, {
                            partOfSpeech: event.target.value as WordEntryDraft["partOfSpeech"],
                            article: event.target.value === "noun" ? item.entry.article : null,
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
                        value={item.entry.article ?? ""}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, {
                            article:
                              event.target.value === ""
                                ? null
                                : (event.target.value as WordEntryDraft["article"]),
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
                        value={item.entry.exampleDe}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { exampleDe: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Usage example (EN)</span>
                      <input
                        value={item.entry.exampleEn}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { exampleEn: event.target.value })
                        }
                      />
                    </label>
                    <label className="field field--full">
                      <span>Notes</span>
                      <input
                        value={item.entry.notes ?? ""}
                        onChange={(event) =>
                          updateBatchQueueEntry(item.id, { notes: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {item.entry.audioUrl ? (
                    <div className="queue-card__audio">
                      <span>Pronunciation</span>
                      <audio controls src={item.entry.audioUrl} />
                    </div>
                  ) : null}
                  <div className="queue-card__actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleApproveQueueItem(item.id)}
                      disabled={item.status !== "pending"}
                    >
                      {item.status === "saved" ? "Saved" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => handleSkipQueueItem(item.id)}
                      disabled={item.status !== "pending"}
                    >
                      {item.status === "skipped" ? "Skipped" : "Skip"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
                {draft.sense ? <span className="preview-card__sense">Sense: {draft.sense}</span> : null}
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
            <span>Sense</span>
            <input
              value={senseValue}
              onChange={(event) => setDraft({ ...draft, sense: event.target.value })}
              placeholder="e.g. riverbank"
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
