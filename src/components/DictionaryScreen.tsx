import { useState } from "react";

import { WordEntry } from "../types/wordEntry";
import "./DictionaryScreen.css";

type DictionaryScreenProps = {
  entries: WordEntry[];
  onClearEntries?: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onRegenerateEntry?: (entry: WordEntry) => Promise<void>;
};

export const DictionaryScreen = ({
  entries,
  onClearEntries,
  onDeleteEntry,
  onRegenerateEntry,
}: DictionaryScreenProps) => {
  const [pendingRegenerations, setPendingRegenerations] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = (entry: WordEntry) => {
    if (!onDeleteEntry) {
      return;
    }
    const confirmed = window.confirm(`Delete "${entry.german}" from your dictionary?`);
    if (!confirmed) {
      return;
    }
    onDeleteEntry(entry.id);
  };

  const handleRegenerate = async (entry: WordEntry) => {
    if (!onRegenerateEntry) {
      return;
    }
    setErrorMessage(null);
    setPendingRegenerations((current) => ({ ...current, [entry.id]: true }));
    try {
      await onRegenerateEntry(entry);
    } catch (error) {
      console.error("Entry regeneration failed:", error);
      setErrorMessage(`Could not regenerate "${entry.german}". Check your LLM settings and try again.`);
    } finally {
      setPendingRegenerations((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    }
  };

  if (entries.length === 0) {
    return (
      <section className="dictionary-screen dictionary-screen--empty">
        <h2>Dictionary</h2>
        <p>Your saved words will appear here once you add them.</p>
      </section>
    );
  }

  return (
    <section className="dictionary-screen">
      <header className="dictionary-screen__header">
        <div>
          <p className="dictionary-screen__eyebrow">Saved words</p>
          <h2>Dictionary</h2>
          <p className="dictionary-screen__subhead">
            Review every word you have saved so far, newest entries at the top.
          </p>
          {errorMessage ? <p className="dictionary-screen__error">{errorMessage}</p> : null}
        </div>
        <div className="dictionary-screen__actions">
          <span className="dictionary-screen__count">{entries.length} total</span>
          {onClearEntries ? (
            <button
              type="button"
              className="dictionary-screen__clear"
              onClick={onClearEntries}
            >
              Clear all words
            </button>
          ) : null}
        </div>
      </header>
      <div className="dictionary-screen__list">
        {entries.map((entry) => {
          const isRegenerating = Boolean(pendingRegenerations[entry.id]);

          return (
            <article className="dictionary-card" key={entry.id}>
              <div className="dictionary-card__media">
                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt={`Illustration for ${entry.german}`} />
                ) : (
                  <div className="dictionary-card__placeholder">No illustration yet</div>
                )}
              </div>
              <header>
                <p className="dictionary-card__german">
                  {entry.article ? `${entry.article} ${entry.german}` : entry.german}
                </p>
                <p className="dictionary-card__english">{entry.english}</p>
                {entry.sense ? <p className="dictionary-card__sense">Sense: {entry.sense}</p> : null}
              </header>
              <div className="dictionary-card__meta">
                <span>{entry.partOfSpeech}</span>
                <span>{entry.source === "llm" ? "LLM-assisted" : "Manual"}</span>
                {entry.llmModel ? <span>{entry.llmModel}</span> : null}
              </div>
              {entry.audioUrl ? (
                <div className="dictionary-card__audio">
                  <span>Pronunciation</span>
                  <audio controls src={entry.audioUrl} />
                </div>
              ) : null}
              <div className="dictionary-card__examples">
                <p>{entry.exampleDe}</p>
                <p className="dictionary-card__translation">{entry.exampleEn}</p>
              </div>
              {entry.notes ? <p className="dictionary-card__notes">{entry.notes}</p> : null}
              {onDeleteEntry || onRegenerateEntry ? (
                <div className="dictionary-card__actions">
                  {onRegenerateEntry ? (
                    <button
                      type="button"
                      className="dictionary-card__action dictionary-card__action--regenerate"
                      onClick={() => void handleRegenerate(entry)}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? "Regenerating..." : "Regenerate"}
                    </button>
                  ) : null}
                  {onDeleteEntry ? (
                    <button
                      type="button"
                      className="dictionary-card__action dictionary-card__action--delete"
                      onClick={() => handleDelete(entry)}
                      disabled={isRegenerating}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
};
