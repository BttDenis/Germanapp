import { useEffect, useMemo, useState } from "react";

import {
  getLearningProgress,
  LearningProgressEntry,
  updateLearningProgress,
} from "../storage/learningProgressStorage";
import { WordEntry } from "../types/wordEntry";
import "./LearningScreen.css";

const SESSION_GOAL = 10;
const GAME_MODES: GameMode[] = ["flashcards", "multiple-choice", "fill-blank"];

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
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{ entry: WordEntry; isCorrect: boolean } | null>(null);

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
    const nextProgress = updateLearningProgress(activeEntry.id, isCorrect);
    setProgressMap(nextProgress);
    const nextReviewed = sessionStats.reviewed + 1;
    const nextCorrect = sessionStats.correct + (isCorrect ? 1 : 0);
    setSessionStats({
      reviewed: nextReviewed,
      correct: nextCorrect,
    });
    setLastAnswer({ entry: activeEntry, isCorrect });
    setFeedback(isCorrect ? "Answer saved." : "Marked for more practice.");
    if (nextReviewed >= SESSION_GOAL) {
      setSessionActive(false);
      setSessionCompleted(true);
      setFeedback("Session complete.");
      return true;
    }
    return false;
  };

  const handleFlashcardAction = (isCorrect: boolean) => {
    const isComplete = handleReview(isCorrect);
    if (!isComplete) {
      pickNextEntry(activeEntry?.id);
    }
  };

  const handleMultipleChoice = (selected: string) => {
    if (!activeEntry) {
      return;
    }
    const isCorrect = selected === activeEntry.english;
    const isComplete = handleReview(isCorrect);
    if (!isComplete) {
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
    const isComplete = handleReview(isCorrect);
    if (!isComplete) {
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
    setSessionCompleted(false);
    setLastAnswer(null);
    pickNextEntry(activeEntry?.id);
  };

  const handleEndSession = () => {
    setSessionActive(false);
    setFeedback(null);
    setSessionCompleted(sessionStats.reviewed > 0);
  };

  const handleExit = () => {
    if (sessionCompleted) {
      setSessionCompleted(false);
      setFeedback(null);
      return;
    }
    handleEndSession();
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
  const sessionView = sessionActive || sessionCompleted;

  return (
    <section className={`learning-screen ${sessionView ? "learning-screen--session" : ""}`}>
      {sessionView ? (
        <>
          <header className="learning-screen__header">
            <button
              type="button"
              className="icon-button"
              aria-label="Exit session"
              onClick={handleExit}
            >
              ✕
            </button>
            <div className="learning-screen__progressbar">
              <span
                style={{
                  width: `${Math.min((sessionStats.reviewed / SESSION_GOAL) * 100, 100)}%`,
                }}
              />
            </div>
            {sessionActive ? (
              <button type="button" className="text-button" onClick={handleEndSession}>
                End session
              </button>
            ) : (
              <button type="button" className="text-button" onClick={handleStartSession}>
                New session
              </button>
            )}
          </header>

          <div className="learning-screen__title learning-screen__title--session">
            <p className="learning-screen__eyebrow">Session</p>
            <h2>{sessionCompleted && !sessionActive ? "Session recap" : "Keep practicing"}</h2>
            <p className="learning-screen__subhead">
              {sessionCompleted && !sessionActive
                ? "You can stop at any time or restart for another 10-word session."
                : "Short, focused practice to keep words fresh."}
            </p>
          </div>

          <div className="learning-screen__stats learning-screen__stats--session">
            <article>
              <h3>Session progress</h3>
              <p>{sessionStats.reviewed} / {SESSION_GOAL} reviewed</p>
              <span>{sessionStats.correct} correct answers</span>
            </article>
          </div>

          <div className="learning-session">
            {sessionActive && activeEntry ? (
              <div className="learning-session__card">
                <div className="learning-session__media">
                  {activeEntry.imageUrl ? (
                    <img src={activeEntry.imageUrl} alt={`Illustration for ${activeEntry.german}`} />
                  ) : (
                    <div className="learning-session__media-placeholder">No illustration yet</div>
                  )}
                </div>
                <div className="learning-session__content">
                  <p className="learning-session__label">Current card</p>
                  <h3 className="learning-session__word">
                    {activeEntry.article ? `${activeEntry.article} ` : ""}
                    {activeEntry.german}
                  </h3>
                  <p className="learning-session__translation">{activeEntry.english}</p>
                  <div className="learning-session__meta">
                    <span>{progress ? `${progress.strength}% strength` : "New word"}</span>
                    <span>{progress?.correctStreak ?? 0} streak</span>
                  </div>
                </div>
              </div>
            ) : null}

            {sessionActive ? (
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
              </div>
            ) : (
              <div className="learning-session__complete">
                <p>{sessionCompleted ? "Session complete. Ready for another round?" : "Session paused. Ready to continue?"}</p>
                <button type="button" className="primary-button" onClick={handleStartSession}>
                  Start new session
                </button>
              </div>
            )}

            {lastAnswer ? (
              <div className="learning-session__card learning-session__card--result">
                <div className="learning-session__media">
                  {lastAnswer.entry.imageUrl ? (
                    <img src={lastAnswer.entry.imageUrl} alt={`Illustration for ${lastAnswer.entry.german}`} />
                  ) : (
                    <div className="learning-session__media-placeholder">No illustration yet</div>
                  )}
                </div>
                <div className="learning-session__content">
                  <div className="learning-session__result-header">
                    <p className="learning-session__label">Last answer</p>
                    <span
                      className={`learning-session__result-badge ${
                        lastAnswer.isCorrect ? "learning-session__result-badge--correct" : "learning-session__result-badge--incorrect"
                      }`}
                    >
                      {lastAnswer.isCorrect ? "Correct" : "Needs work"}
                    </span>
                  </div>
                  <h3 className="learning-session__word">
                    {lastAnswer.entry.article ? `${lastAnswer.entry.article} ` : ""}
                    {lastAnswer.entry.german}
                  </h3>
                  <p className="learning-session__translation">{lastAnswer.entry.english}</p>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="learning-screen__title">
            <p className="learning-screen__eyebrow">Learning studio</p>
            <h2>One-session practice</h2>
            <p className="learning-screen__subhead">
              Answer quick prompts to move to the next card.
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

          <div className="learning-session">
            <div className="learning-session__card">
              <div className="learning-session__media">
                {activeEntry?.imageUrl ? (
                  <img src={activeEntry.imageUrl} alt={`Illustration for ${activeEntry.german}`} />
                ) : (
                  <div className="learning-session__media-placeholder">No illustration yet</div>
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

            <div className="learning-session__start">
              <p>Ready to practice? Start a focused 10-word session and answer each prompt.</p>
              <button type="button" className="primary-button" onClick={handleStartSession}>
                Start session
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
