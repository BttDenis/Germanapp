import { useEffect, useState } from "react";

import { AddWordScreen } from "./components/AddWordScreen";
import { DictionaryScreen } from "./components/DictionaryScreen";
import { LearningScreen } from "./components/LearningScreen";
import { generateLlmCard } from "./services/llmCardGenerator";
import { generateLlmImage } from "./services/llmImageGenerator";
import {
  WORD_ENTRIES_STORAGE_KEY,
  clearWordEntries,
  deleteWordEntry,
  getWordEntries,
  setWordEntries,
  updateWordEntry,
} from "./storage/wordEntriesStorage";
import { WordEntry } from "./types/wordEntry";
import {
  SyncConflict,
  recordEntryDeletion,
  scheduleRemoteSync,
  syncFromRemote,
} from "./services/wordEntriesSync";
import { SyncConflictScreen } from "./components/SyncConflictScreen";
import "./App.css";

type Page = "learn" | "add" | "dictionary";

export const App = () => {
  const [currentPage, setCurrentPage] = useState<Page>("learn");
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);

  useEffect(() => {
    setEntries(getWordEntries());
  }, []);

  useEffect(() => {
    const loadRemoteEntries = async () => {
      try {
        const result = await syncFromRemote();
        if (result.conflicts.length > 0) {
          setSyncConflicts(result.conflicts);
        }
        if (result.enabled && result.changed) {
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
    scheduleRemoteSync((result) => {
      if (result.conflicts.length > 0) {
        setSyncConflicts(result.conflicts);
      }
      if (result.enabled && result.changed) {
        setEntries(getWordEntries());
      }
    });
  }, [entries]);

  const handleEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    setCurrentPage("learn");
  };

  const handleBatchEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
  };

  const handleClearEntries = () => {
    entries.forEach((entry) => recordEntryDeletion(entry.id));
    clearWordEntries();
    setEntries([]);
  };

  const handleDeleteEntry = (entryId: string) => {
    const saved = deleteWordEntry(entryId);
    recordEntryDeletion(entryId);
    setEntries(saved);
  };

  const handleResolveConflict = (conflictId: string, action: "local" | "remote" | "merge") => {
    const conflict = syncConflicts.find((item) => item.id === conflictId);
    if (!conflict) {
      return;
    }

    if (action === "remote" && conflict.remote) {
      const nextEntries = getWordEntries().filter((entry) => entry.id !== conflict.id);
      setEntries(setWordEntries([conflict.remote, ...nextEntries]));
    } else if (action === "merge" && conflict.local && conflict.remote) {
      const merged: WordEntry = {
        ...conflict.remote,
        ...conflict.local,
        article: conflict.local.article ?? conflict.remote.article ?? null,
        exampleDe: conflict.local.exampleDe || conflict.remote.exampleDe,
        exampleEn: conflict.local.exampleEn || conflict.remote.exampleEn,
        notes: conflict.local.notes || conflict.remote.notes,
        imageUrl: conflict.local.imageUrl ?? conflict.remote.imageUrl ?? null,
        audioUrl: conflict.local.audioUrl ?? conflict.remote.audioUrl ?? null,
        llmModel: conflict.local.llmModel ?? conflict.remote.llmModel ?? null,
        llmGeneratedAt: conflict.local.llmGeneratedAt ?? conflict.remote.llmGeneratedAt ?? null,
        source: conflict.local.source ?? conflict.remote.source,
      };
      const saved = updateWordEntry(merged);
      setEntries(saved);
    } else if (action === "local" && conflict.type === "delete") {
      recordEntryDeletion(conflict.id);
      const saved = deleteWordEntry(conflict.id);
      setEntries(saved);
    }

    setSyncConflicts((prev) => prev.filter((item) => item.id !== conflictId));
  };

  const handleRegenerateEntry = async (entry: WordEntry) => {
    const generated = await generateLlmCard({
      inputLanguage: "de",
      userText: entry.german,
      regenerate: true,
    });
    let imageUrl = entry.imageUrl ?? null;

    try {
      const imageResult = await generateLlmImage({
        german: generated.draft.german,
        useCache: false,
      });
      imageUrl = imageResult.imageUrl;
    } catch (error) {
      console.warn("Image regeneration failed:", error);
    }

    const updatedEntry: WordEntry = {
      ...entry,
      ...generated.draft,
      notes: generated.draft.notes ?? "",
      imageUrl,
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
      {syncConflicts.length > 0 ? (
        <SyncConflictScreen conflicts={syncConflicts} onResolve={handleResolveConflict} />
      ) : null}
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
