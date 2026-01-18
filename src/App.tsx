import { useEffect, useState } from "react";

import { AddWordScreen } from "./components/AddWordScreen";
import { DictionaryScreen } from "./components/DictionaryScreen";
import { getWordEntries } from "./storage/wordEntriesStorage";
import { WordEntry } from "./types/wordEntry";
import "./App.css";

export const App = () => {
  const [currentPage, setCurrentPage] = useState<"add" | "dictionary">("add");
  const [entries, setEntries] = useState<WordEntry[]>([]);

  useEffect(() => {
    setEntries(getWordEntries());
  }, []);

  const handleEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
  };

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>German Vocabulary Trainer</h1>
          <p>Generate a draft card with LLM assistance, then edit and save it.</p>
        </div>
        <nav className="app__nav">
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
      {currentPage === "add" ? (
        <AddWordScreen onEntrySaved={handleEntrySaved} />
      ) : (
        <DictionaryScreen entries={entries} />
      )}
    </main>
  );
};
