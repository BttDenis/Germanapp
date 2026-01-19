import { useState } from "react";

import { WordEntry } from "../types/wordEntry";
import "./DictionaryScreen.css";

type DictionaryScreenProps = {
  entries: WordEntry[];
  onClearEntries?: () => void;
  onExportEntries?: () => string;
  onImportEntries?: (payload: string) => { added: number; total: number };
};

export const DictionaryScreen = ({
  entries,
  onClearEntries,
  onExportEntries,
  onImportEntries,
}: DictionaryScreenProps) => {
  const [syncCode, setSyncCode] = useState("");
  const [syncInput, setSyncInput] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleGenerateSyncCode = () => {
    if (!onExportEntries) {
      return;
    }
    setSyncCode(onExportEntries());
    setSyncMessage("Sync code generated. Copy it to use on another device.");
  };

  const handleCopySyncCode = async () => {
    if (!syncCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(syncCode);
      setSyncMessage("Sync code copied to clipboard.");
    } catch {
      setSyncMessage("Copy failed. You can manually select and copy the sync code.");
    }
  };

  const handleImportSyncCode = () => {
    if (!onImportEntries) {
      return;
    }
    try {
      const result = onImportEntries(syncInput);
      setSyncMessage(`Imported ${result.added} new words. ${result.total} total in your dictionary.`);
      setSyncInput("");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Import failed. Check the sync code.");
    }
  };

  if (entries.length === 0) {
    return (
      <section className="dictionary-screen dictionary-screen--empty">
        <h2>Dictionary</h2>
        <p>Your saved words will appear here once you add them.</p>
        <div className="dictionary-screen__sync">
          <div>
            <h3>Sync & backup</h3>
            <p>Generate a sync code, then paste it on another device to load the same dictionary.</p>
          </div>
          <div className="dictionary-screen__sync-controls">
            <textarea
              value={syncCode}
              readOnly
              placeholder="Generate a sync code to copy it."
            />
            <div className="dictionary-screen__sync-actions">
              <button type="button" className="primary" onClick={handleGenerateSyncCode}>
                Generate sync code
              </button>
              <button type="button" className="ghost" onClick={handleCopySyncCode} disabled={!syncCode}>
                Copy sync code
              </button>
            </div>
            <textarea
              value={syncInput}
              onChange={(event) => setSyncInput(event.target.value)}
              placeholder="Paste a sync code to import words."
            />
            <button type="button" className="ghost" onClick={handleImportSyncCode} disabled={!syncInput.trim()}>
              Import sync code
            </button>
            {syncMessage ? <p className="dictionary-screen__sync-message">{syncMessage}</p> : null}
          </div>
        </div>
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
        {entries.map((entry) => (
          <article className="dictionary-card" key={entry.id}>
            <header>
              <p className="dictionary-card__german">
                {entry.article ? `${entry.article} ${entry.german}` : entry.german}
              </p>
              <p className="dictionary-card__english">{entry.english}</p>
            </header>
            <div className="dictionary-card__meta">
              <span>{entry.partOfSpeech}</span>
              <span>{entry.source === "llm" ? "LLM-assisted" : "Manual"}</span>
              {entry.llmModel ? <span>{entry.llmModel}</span> : null}
            </div>
            <div className="dictionary-card__examples">
              <p>{entry.exampleDe}</p>
              <p className="dictionary-card__translation">{entry.exampleEn}</p>
            </div>
            {entry.notes ? <p className="dictionary-card__notes">{entry.notes}</p> : null}
          </article>
        ))}
      </div>
      <section className="dictionary-screen__sync">
        <div>
          <h3>Sync & backup</h3>
          <p>Generate a sync code and paste it on another device to keep your dictionary in sync.</p>
        </div>
        <div className="dictionary-screen__sync-controls">
          <textarea
            value={syncCode}
            readOnly
            placeholder="Generate a sync code to copy it."
          />
          <div className="dictionary-screen__sync-actions">
            <button type="button" className="primary" onClick={handleGenerateSyncCode}>
              Generate sync code
            </button>
            <button type="button" className="ghost" onClick={handleCopySyncCode} disabled={!syncCode}>
              Copy sync code
            </button>
          </div>
          <textarea
            value={syncInput}
            onChange={(event) => setSyncInput(event.target.value)}
            placeholder="Paste a sync code to import words."
          />
          <button type="button" className="ghost" onClick={handleImportSyncCode} disabled={!syncInput.trim()}>
            Import sync code
          </button>
          {syncMessage ? <p className="dictionary-screen__sync-message">{syncMessage}</p> : null}
        </div>
      </section>
    </section>
  );
};
