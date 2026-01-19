import { useEffect, useState } from "react";

import { AddWordScreen } from "./components/AddWordScreen";
import { DictionaryScreen } from "./components/DictionaryScreen";
import { LearningScreen } from "./components/LearningScreen";
import { generateLlmCard } from "./services/llmCardGenerator";
import {
  WORD_ENTRIES_STORAGE_KEY,
  clearWordEntries,
  deleteWordEntry,
  getWordEntries,
  updateWordEntry,
} from "./storage/wordEntriesStorage";
import { WordEntry } from "./types/wordEntry";
import { scheduleRemoteSync, syncFromRemote } from "./services/wordEntriesSync";
import "./App.css";

type Page = "learn" | "add" | "dictionary";

export const App = () => {
  const [currentPage, setCurrentPage] = useState<Page>("learn");
  const [entries, setEntries] = useState<WordEntry[]>([]);

  useEffect(() => {
    setEntries(getWordEntries());
  }, []);

  useEffect(() => {
    const loadRemoteEntries = async () => {
      try {
        const result = await syncFromRemote();
        if (result.enabled && result.added > 0) {
          setEntries(getWordEntries());
        }
      } catch (error) {
        console.error("Remote sync failed:", error);
      }
    };

    loadRemoteEntries();
  }, []);

  useEffect(() => {
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key === WORD_ENTRIES_STORAGE_KEY) {
        setEntries(getWordEntries());
      }
    };

    window.addEventListener("storage", handleStorageUpdate);
    return () => window.removeEventListener("storage", handleStorageUpdate);
  }, []);

  useEffect(() => {
    scheduleRemoteSync();
  }, [entries]);

  const handleEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    setCurrentPage("learn");
  };

  const handleBatchEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
  };

  const handleClearEntries = () => {
    clearWordEntries();
    setEntries([]);
  };

  const handleDeleteEntry = (entryId: string) => {
    const saved = deleteWordEntry(entryId);
    setEntries(saved);
  };

  const handleRegenerateEntry = async (entry: WordEntry) => {
    const generated = await generateLlmCard({
      inputLanguage: "de",
      userText: entry.german,
      regenerate: true,
    });
    const updatedEntry: WordEntry = {
      ...entry,
      ...generated.draft,
      notes: generated.draft.notes ?? "",
      imageUrl: entry.imageUrl ?? null,
      audioUrl: entry.audioUrl ?? null,
      source: "llm",
      llmGeneratedAt: generated.llmGeneratedAt,
      llmModel: generated.llmModel,
    };
    const saved = updateWordEntry(updatedEntry);
    setEntries(saved);
  };

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>German Vocabulary Trainer</h1>
          <p>Learn new words with focused games, then add and review entries.</p>
        </div>
        <nav className="app__nav">
          <button
            type="button"
            className={currentPage === "learn" ? "app__nav-button is-active" : "app__nav-button"}
            onClick={() => setCurrentPage("learn")}
          >
            Learning studio
          </button>
          <button
            type="button"
            className={currentPage === "add" ? "app__nav-button is-active" : "app__nav-button"}
            onClick={() => setCurrentPage("add")}
          >
            Add word
          </button>
          <button
            type="button"
            className={currentPage === "dictionary" ? "app__nav-button is-active" : "app__nav-button"}
            onClick={() => setCurrentPage("dictionary")}
          >
            Dictionary
          </button>
        </nav>
      </header>
      {currentPage === "learn" ? (
        <LearningScreen entries={entries} />
      ) : currentPage === "add" ? (
        <AddWordScreen onEntrySaved={handleEntrySaved} onBatchEntrySaved={handleBatchEntrySaved} />
      ) : (
        <DictionaryScreen
          entries={entries}
          onClearEntries={handleClearEntries}
          onDeleteEntry={handleDeleteEntry}
          onRegenerateEntry={handleRegenerateEntry}
        />
      )}
    </main>
  );
};
