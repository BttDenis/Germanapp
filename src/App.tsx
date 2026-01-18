import { useEffect, useState } from "react";

import { AddWordScreen } from "./components/AddWordScreen";
import { DictionaryScreen } from "./components/DictionaryScreen";
import { LearningScreen } from "./components/LearningScreen";
import { clearWordEntries, getWordEntries } from "./storage/wordEntriesStorage";
import { WordEntry } from "./types/wordEntry";
import "./App.css";

type Page = "learn" | "add" | "dictionary";

export const App = () => {
  const [currentPage, setCurrentPage] = useState<Page>("learn");
  const [entries, setEntries] = useState<WordEntry[]>([]);

  useEffect(() => {
    setEntries(getWordEntries());
  }, []);

  const handleEntrySaved = (entry: WordEntry) => {
    setEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
    setCurrentPage("learn");
  };

  const handleClearEntries = () => {
    clearWordEntries();
    setEntries([]);
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
        <AddWordScreen onEntrySaved={handleEntrySaved} />
      ) : (
        <DictionaryScreen entries={entries} onClearEntries={handleClearEntries} />
      )}
    </main>
  );
};
