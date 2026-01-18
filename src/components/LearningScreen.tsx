import { useEffect, useMemo, useState } from "react";

import {
  getLearningProgress,
  LearningProgressEntry,
  updateLearningProgress,
} from "../storage/learningProgressStorage";
import { WordEntry } from "../types/wordEntry";
import "./LearningScreen.css";

const SESSION_WORD_LIMIT = 10;
const GAME_MODES: GameMode[] = ["flashcards", "multiple-choice", "fill-blank"];

type LearningScreenProps = {
  entries: WordEntry[];
};

type GameMode = "flashcards" | "multiple-choice" | "fill-blank";

type SessionStats = {
  reviewed: number;
  correct: number;
};

type SessionResult = {
  entry: WordEntry;
  isCorrect: boolean;
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
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<SessionResult | null>(null);

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
    setGameMode(GAME_MODES[Math.floor(Math.random() * GAME_MODES.length)]);
  };

  const handleReview = (isCorrect: boolean) => {
    if (!activeEntry) {
      return false;
    }
    const nextReviewed = sessionStats.reviewed + 1;
    const nextCorrect = sessionStats.correct + (isCorrect ? 1 : 0);
    const nextProgress = updateLearningProgress(activeEntry.id, isCorrect);
    setProgressMap(nextProgress);
    setSessionStats({
      reviewed: nextReviewed,
      correct: nextCorrect,
    });
    setFeedback(isCorrect ? "Nice! Marked as correct." : "No worries—let's try again.");
    setLastAnswer({ entry: activeEntry, isCorrect });

    if (nextReviewed >= SESSION_WORD_LIMIT) {
      setSessionActive(false);
      setSessionComplete(true);
      setSessionNote("Session complete! Great work today.");
      return false;
    }

    return true;
  };

  const handleFlashcardAction = (isCorrect: boolean) => {
    const shouldContinue = handleReview(isCorrect);
    if (shouldContinue) {
      pickNextEntry(activeEntry?.id);
    }
  };

  const handleMultipleChoice = (selected: string) => {
    if (!activeEntry) {
      return;
    }
    const isCorrect = selected === activeEntry.english;
    const shouldContinue = handleReview(isCorrect);
    if (shouldContinue) {
      pickNextEntry(activeEntry.id);
    }
  };

  const handleFillSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEntry) {
      return;
    }
    const normalized = fillAnswer.trim().toLowerCase();
    const isCorrect = normalized === activeEntry.german.trim().toLowerCase();
    const shouldContinue = handleReview(isCorrect);
    if (shouldContinue) {
      pickNextEntry(activeEntry.id);
    }
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

  const handleStartSession = () => {
    setSessionStats({ reviewed: 0, correct: 0 });
    setFeedback(null);
    setSessionActive(true);
    setSessionComplete(false);
    setSessionNote(null);
    setLastAnswer(null);
    pickNextEntry(activeEntry?.id);
  };

  const handleEndSession = (note: string) => {
    setSessionActive(false);
    setSessionComplete(true);
    setSessionNote(note);
    setShowAnswer(false);
    setFillAnswer("");
    setFeedback(null);
  };

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
      {sessionActive ? (
        <header className="learning-screen__header learning-screen__header--session">
          <button
            type="button"
            className="icon-button"
            aria-label="Exit session"
            onClick={() => handleEndSession("Session ended early. Come back anytime.")}
          >
            ✕
          </button>
          <div className="learning-screen__progressbar">
            <span
              style={{
                width: `${Math.min((sessionStats.reviewed / SESSION_WORD_LIMIT) * 100, 100)}%`,
              }}
            />
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => handleEndSession("Session finished early. Nice focus!")}
          >
            Finish
          </button>
        </header>
      ) : (
        <>
          <div className="learning-screen__title">
            <p className="learning-screen__eyebrow">Learning studio</p>
            <h2>One-session practice</h2>
            <p className="learning-screen__subhead">
              Complete {SESSION_WORD_LIMIT} quick prompts, then take a break.
            </p>
          </div>

          <div className="learning-screen__stats">
            <article>
              <h3>Session progress</h3>
              <p>{sessionStats.reviewed} reviewed</p>
              <span>{sessionStats.correct} correct answers</span>
            </article>
            <article>
              <h3>Vocabulary bank</h3>
              <p>{entries.length} words saved</p>
              <span>{reviewCountToday} reviewed today</span>
            </article>
            <article>
              <h3>Mastery</h3>
              <p>{summary.mastered} mastered</p>
              <span>{summary.needsPractice} need practice</span>
            </article>
          </div>
        </>
      )}

      <div className="learning-session">
        <div className="learning-session__card">
          <div className="learning-session__media">
            {activeEntry?.imageUrl ? (
              <img src={activeEntry.imageUrl} alt={`Illustration for ${activeEntry.german}`} />
            ) : (
              <div className="learning-session__media-placeholder" aria-hidden="true">
                Illustration pending
              </div>
            )}
          </div>
          <div className="learning-session__content">
            <p className="learning-session__label">Active card</p>
            <h3 className="learning-session__word">
              {activeEntry ? `${activeEntry.article ? `${activeEntry.article} ` : ""}${activeEntry.german}` : "—"}
            </h3>
            <p className="learning-session__translation">
              {activeEntry ? activeEntry.english : "Select a word to begin."}
            </p>
            <div className="learning-session__meta">
              <span>{progress ? `${progress.strength}% strength` : "New word"}</span>
              <span>{progress?.correctStreak ?? 0} streak</span>
            </div>
          </div>
        </div>

        {!sessionActive ? (
          <div className="learning-session__start">
            <p>{sessionNote ?? "Ready to practice? Start a focused session and answer each prompt."}</p>
            <div className="learning-session__start-actions">
              <button type="button" className="primary-button" onClick={handleStartSession}>
                {sessionComplete ? "Start new session" : "Start session"}
              </button>
              <button type="button" className="text-button" onClick={() => pickNextEntry(activeEntry?.id)}>
                Shuffle card
              </button>
            </div>
          </div>
        ) : (
          <div className="learning-session__game">
            <div className="learning-session__game-header">
              <div>
                <p className="learning-session__game-label">Game</p>
                <h3>
                  {gameMode === "flashcards" && "Flashcard"}
                  {gameMode === "multiple-choice" && "Multiple choice"}
                  {gameMode === "fill-blank" && "Write the word"}
                </h3>
              </div>
              {feedback ? <span className="learning-screen__feedback">{feedback}</span> : null}
            </div>
            <div className="learning-session__session-meta">
              <p>
                {sessionStats.reviewed}/{SESSION_WORD_LIMIT} reviewed
              </p>
              <span>{sessionStats.correct} correct</span>
              <button type="button" className="text-button" onClick={() => pickNextEntry(activeEntry?.id)}>
                Skip
              </button>
            </div>

            {gameMode === "flashcards" && activeEntry ? (
              <div className="game-card game-card--compact">
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
              <div className="game-card game-card--compact">
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
              <div className="game-card game-card--compact">
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

            {lastAnswer ? (
              <div
                className={`learning-session__result ${
                  lastAnswer.isCorrect ? "learning-session__result--correct" : "learning-session__result--incorrect"
                }`}
              >
                <div className="learning-session__result-media">
                  {lastAnswer.entry.imageUrl ? (
                    <img
                      src={lastAnswer.entry.imageUrl}
                      alt={`Illustration for ${lastAnswer.entry.german}`}
                    />
                  ) : (
                    <div className="learning-session__media-placeholder" aria-hidden="true">
                      Illustration pending
                    </div>
                  )}
                </div>
                <div>
                  <p className="learning-session__label">Last answer</p>
                  <h4>
                    {lastAnswer.entry.article ? `${lastAnswer.entry.article} ` : ""}
                    {lastAnswer.entry.german}
                  </h4>
                  <p className="learning-session__translation">{lastAnswer.entry.english}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};
