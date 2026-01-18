import { useEffect, useMemo, useState } from "react";

import {
  getLearningProgress,
  LearningProgressEntry,
  updateLearningProgress,
} from "../storage/learningProgressStorage";
import { WordEntry } from "../types/wordEntry";
import "./LearningScreen.css";

const SESSION_GOAL = 8;

type LearningScreenProps = {
  entries: WordEntry[];
};

type GameMode = "flashcards" | "multiple-choice" | "fill-blank";

type SessionStats = {
  reviewed: number;
  correct: number;
};

const shuffle = <T,>(items: T[]) => {
  return [...items].sort(() => Math.random() - 0.5);
};

const formatDateKey = (value: string | null) => {
  if (!value) {
    return null;
  }
  return new Date(value).toDateString();
};

export const LearningScreen = ({ entries }: LearningScreenProps) => {
  const [progressMap, setProgressMap] = useState<Record<string, LearningProgressEntry>>({});
  const [gameMode, setGameMode] = useState<GameMode>("flashcards");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [fillAnswer, setFillAnswer] = useState("");
  const [sessionStats, setSessionStats] = useState<SessionStats>({ reviewed: 0, correct: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setProgressMap(getLearningProgress());
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      setActiveEntryId(null);
      return;
    }
    setActiveEntryId((current) => current ?? entries[0].id);
  }, [entries]);

  const activeEntry = useMemo(() => {
    return entries.find((entry) => entry.id === activeEntryId) ?? null;
  }, [activeEntryId, entries]);

  const reviewCountToday = useMemo(() => {
    const todayKey = new Date().toDateString();
    return Object.values(progressMap).filter(
      (progress) => formatDateKey(progress.lastReviewedAt) === todayKey,
    ).length;
  }, [progressMap]);

  const summary = useMemo(() => {
    const progressList = Object.values(progressMap);
    const mastered = progressList.filter((entry) => entry.strength >= 80).length;
    const learning = progressList.filter((entry) => entry.strength >= 50 && entry.strength < 80).length;
    const needsPractice = progressList.filter((entry) => entry.strength < 50).length;

    return {
      mastered,
      learning,
      needsPractice,
    };
  }, [progressMap]);

  const progressForEntry = (entry: WordEntry | null) => {
    if (!entry) {
      return null;
    }
    return progressMap[entry.id] ?? null;
  };

  const pickNextEntry = (previousId?: string) => {
    if (entries.length === 0) {
      return;
    }
    const options = entries.filter((entry) => entry.id !== previousId);
    const next = (options.length ? options : entries)[Math.floor(Math.random() * (options.length || entries.length))];
    setActiveEntryId(next.id);
    setShowAnswer(false);
    setFillAnswer("");
    setFeedback(null);
  };

  const handleReview = (isCorrect: boolean) => {
    if (!activeEntry) {
      return;
    }
    const nextProgress = updateLearningProgress(activeEntry.id, isCorrect);
    setProgressMap(nextProgress);
    setSessionStats((prev) => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    }));
    setFeedback(isCorrect ? "Nice! Marked as correct." : "No worries—let's try again.");
  };

  const handleFlashcardAction = (isCorrect: boolean) => {
    handleReview(isCorrect);
    pickNextEntry(activeEntry?.id);
  };

  const handleMultipleChoice = (selected: string) => {
    if (!activeEntry) {
      return;
    }
    const isCorrect = selected === activeEntry.english;
    handleReview(isCorrect);
    pickNextEntry(activeEntry.id);
  };

  const handleFillSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEntry) {
      return;
    }
    const normalized = fillAnswer.trim().toLowerCase();
    const isCorrect = normalized === activeEntry.german.trim().toLowerCase();
    handleReview(isCorrect);
    pickNextEntry(activeEntry.id);
  };

  const multipleChoiceOptions = useMemo(() => {
    if (!activeEntry) {
      return [];
    }
    const distractors = shuffle(
      entries.filter((entry) => entry.id !== activeEntry.id && entry.english.trim() !== ""),
    ).slice(0, 3);
    return shuffle([activeEntry, ...distractors]).map((entry) => entry.english);
  }, [activeEntry, entries]);

  if (entries.length === 0) {
    return (
      <section className="learning-screen learning-screen--empty">
        <h2>Learning studio</h2>
        <p>Add your first words to unlock tailored review games.</p>
      </section>
    );
  }

  const progress = progressForEntry(activeEntry);

  return (
    <section className="learning-screen">
      <header className="learning-screen__header">
        <div>
          <p className="learning-screen__eyebrow">Main learning hub</p>
          <h2>Learning studio</h2>
          <p className="learning-screen__subhead">
            Mix games, track mastery, and keep your daily practice streak on pace.
          </p>
        </div>
        <div className="learning-screen__goal">
          <p>Daily goal</p>
          <span>
            {Math.min(sessionStats.reviewed, SESSION_GOAL)}/{SESSION_GOAL} reviews
          </span>
          <div className="learning-screen__progress">
            <span
              style={{
                width: `${Math.min((sessionStats.reviewed / SESSION_GOAL) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      </header>

      <div className="learning-screen__stats">
        <article>
          <h3>Vocabulary bank</h3>
          <p>{entries.length} words saved</p>
          <span>{reviewCountToday} reviewed today</span>
        </article>
        <article>
          <h3>Mastery</h3>
          <p>{summary.mastered} mastered</p>
          <span>{summary.learning} building confidence</span>
        </article>
        <article>
          <h3>Focus list</h3>
          <p>{summary.needsPractice} need practice</p>
          <span>{sessionStats.correct} correct in this session</span>
        </article>
      </div>

      <div className="learning-screen__modes">
        <button
          type="button"
          className={gameMode === "flashcards" ? "mode-button is-active" : "mode-button"}
          onClick={() => setGameMode("flashcards")}
        >
          Flashcards
        </button>
        <button
          type="button"
          className={gameMode === "multiple-choice" ? "mode-button is-active" : "mode-button"}
          onClick={() => setGameMode("multiple-choice")}
        >
          Multiple choice
        </button>
        <button
          type="button"
          className={gameMode === "fill-blank" ? "mode-button is-active" : "mode-button"}
          onClick={() => setGameMode("fill-blank")}
        >
          Fill in the blank
        </button>
      </div>

      <div className="learning-screen__game">
        <aside className="learning-screen__coach">
          <h3>Word coach</h3>
          {activeEntry ? (
            <ul>
              <li>
                <strong>Active word:</strong> {activeEntry.article ? `${activeEntry.article} ` : ""}
                {activeEntry.german}
              </li>
              <li>
                <strong>Meaning:</strong> {activeEntry.english}
              </li>
              <li>
                <strong>Strength:</strong> {progress ? `${progress.strength}%` : "New"}
              </li>
              <li>
                <strong>Streak:</strong> {progress?.correctStreak ?? 0} correct
              </li>
            </ul>
          ) : null}
          {feedback ? <p className="learning-screen__feedback">{feedback}</p> : null}
          <button type="button" className="ghost-button" onClick={() => pickNextEntry(activeEntry?.id)}>
            Swap word
          </button>
        </aside>

        <div className="learning-screen__panel">
          {gameMode === "flashcards" && activeEntry ? (
            <div className="game-card">
              <h3>Flashcard</h3>
              <p className="game-card__prompt">Tap to reveal the translation.</p>
              <button
                type="button"
                className="flashcard"
                onClick={() => setShowAnswer((prev) => !prev)}
              >
                <span>{activeEntry.article ? `${activeEntry.article} ` : ""}{activeEntry.german}</span>
                {showAnswer ? <span className="flashcard__answer">{activeEntry.english}</span> : null}
              </button>
              <div className="game-card__actions">
                <button type="button" className="outline-button" onClick={() => handleFlashcardAction(false)}>
                  Needs practice
                </button>
                <button type="button" className="primary-button" onClick={() => handleFlashcardAction(true)}>
                  I got it
                </button>
              </div>
            </div>
          ) : null}

          {gameMode === "multiple-choice" && activeEntry ? (
            <div className="game-card">
              <h3>Multiple choice</h3>
              <p className="game-card__prompt">Choose the correct translation.</p>
              <div className="choice-prompt">
                {activeEntry.article ? `${activeEntry.article} ` : ""}
                {activeEntry.german}
              </div>
              <div className="choice-grid">
                {multipleChoiceOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="choice-button"
                    onClick={() => handleMultipleChoice(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {gameMode === "fill-blank" && activeEntry ? (
            <div className="game-card">
              <h3>Fill in the blank</h3>
              <p className="game-card__prompt">Type the German word that matches the meaning.</p>
              <div className="fill-prompt">{activeEntry.english}</div>
              <form className="fill-form" onSubmit={handleFillSubmit}>
                <input
                  type="text"
                  value={fillAnswer}
                  onChange={(event) => setFillAnswer(event.target.value)}
                  placeholder="Type the German word"
                />
                <button type="submit" className="primary-button" disabled={!fillAnswer.trim()}>
                  Check answer
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
