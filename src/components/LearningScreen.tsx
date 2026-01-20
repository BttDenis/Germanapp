import { useEffect, useMemo, useRef, useState } from "react";

import {
  getLearningProgress,
  LearningProgressEntry,
  updateLearningProgress,
} from "../storage/learningProgressStorage";
import { WordEntry } from "../types/wordEntry";
import "./LearningScreen.css";

const SESSION_WORD_LIMIT = 10;
const GAME_MODES: GameMode[] = ["multiple-choice", "fill-blank", "letter-select"];

type LearningScreenProps = {
  entries: WordEntry[];
};

type GameMode = "multiple-choice" | "fill-blank" | "letter-select";

type SessionStats = {
  reviewed: number;
  correct: number;
};

type SessionResult = {
  entry: WordEntry;
  isCorrect: boolean;
};

type LetterTile = {
  id: number;
  value: string;
  used: boolean;
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
  const [gameMode, setGameMode] = useState<GameMode>("multiple-choice");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [fillAnswer, setFillAnswer] = useState("");
  const [sessionStats, setSessionStats] = useState<SessionStats>({ reviewed: 0, correct: 0 });
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionNote, setSessionNote] = useState<string | null>(null);
  const [resultCard, setResultCard] = useState<SessionResult | null>(null);
  const [pendingSessionComplete, setPendingSessionComplete] = useState(false);
  const [letterTiles, setLetterTiles] = useState<LetterTile[]>([]);
  const [letterProgress, setLetterProgress] = useState<string[]>([]);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const pickNextEntry = (previousId?: string) => {
    if (entries.length === 0) {
      return;
    }
    const options = entries.filter((entry) => entry.id !== previousId);
    const next = (options.length ? options : entries)[Math.floor(Math.random() * (options.length || entries.length))];
    setActiveEntryId(next.id);
    setFillAnswer("");
    setResultCard(null);
    setPendingSessionComplete(false);
    setGameMode(GAME_MODES[Math.floor(Math.random() * GAME_MODES.length)]);
  };

  const handleReview = (isCorrect: boolean) => {
    if (!activeEntry) {
      return;
    }
    const nextReviewed = sessionStats.reviewed + 1;
    const nextCorrect = sessionStats.correct + (isCorrect ? 1 : 0);
    const nextProgress = updateLearningProgress(activeEntry.id, isCorrect);
    setProgressMap(nextProgress);
    setSessionStats({
      reviewed: nextReviewed,
      correct: nextCorrect,
    });
    setResultCard({ entry: activeEntry, isCorrect });

    if (nextReviewed >= SESSION_WORD_LIMIT) {
      setPendingSessionComplete(true);
    }
  };

  const handleMultipleChoice = (selected: string) => {
    if (!activeEntry) {
      return;
    }
    const isCorrect = selected === activeEntry.english;
    handleReview(isCorrect);
  };

  const handleFillSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEntry) {
      return;
    }
    const normalized = fillAnswer.trim().toLowerCase();
    const isCorrect = normalized === activeEntry.german.trim().toLowerCase();
    handleReview(isCorrect);
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
    setSessionActive(true);
    setSessionComplete(false);
    setSessionNote(null);
    setResultCard(null);
    setPendingSessionComplete(false);
    pickNextEntry(activeEntry?.id);
  };

  const handleEndSession = (note: string) => {
    setSessionActive(false);
    setSessionComplete(true);
    setSessionNote(note);
    setFillAnswer("");
    setResultCard(null);
    setPendingSessionComplete(false);
  };

  useEffect(() => {
    if (!activeEntry || gameMode !== "letter-select") {
      setLetterTiles([]);
      setLetterProgress([]);
      return;
    }
    const target = Array.from(activeEntry.german.replace(/[^\p{L}]/gu, ""));
    setLetterTiles(shuffle(target).map((value, index) => ({ id: index, value, used: false })));
    setLetterProgress([]);
  }, [activeEntry, gameMode]);

  useEffect(() => {
    if (!resultCard) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (continueButtonRef.current) {
      continueButtonRef.current.focus({ preventScroll: true });
    }
  }, [resultCard]);

  const targetLetters = useMemo(() => {
    if (!activeEntry) {
      return [];
    }
    return Array.from(activeEntry.german.replace(/[^\p{L}]/gu, ""));
  }, [activeEntry]);

  const handleLetterPick = (tile: LetterTile) => {
    if (!activeEntry || tile.used || resultCard) {
      return;
    }
    const expectedLetter = targetLetters[letterProgress.length];
    if (!expectedLetter) {
      return;
    }
    if (tile.value !== expectedLetter) {
      setLetterTiles((current) =>
        current.map((item) => (item.id === tile.id ? { ...item, used: true } : item)),
      );
      handleReview(false);
      return;
    }

    setLetterTiles((current) =>
      current.map((item) => (item.id === tile.id ? { ...item, used: true } : item)),
    );
    setLetterProgress((current) => {
      const next = [...current, tile.value];
      if (next.length === targetLetters.length) {
        handleReview(true);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (pendingSessionComplete) {
      setSessionActive(false);
      setSessionComplete(true);
      setSessionNote("Session complete! Great work today.");
      setResultCard(null);
      setPendingSessionComplete(false);
      return;
    }

    setResultCard(null);
    pickNextEntry(activeEntry?.id);
  };

  if (entries.length === 0) {
    return (
      <section className="learning-screen learning-screen--empty">
        <h2>Learning studio</h2>
        <p>Add your first words to unlock tailored review games.</p>
      </section>
    );
  }

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
        {!sessionActive ? (
          <div className="learning-session__start">
            <p>{sessionNote ?? "Ready to practice? Start a focused session and answer each prompt."}</p>
            <div className="learning-session__start-actions">
              <button type="button" className="primary-button" onClick={handleStartSession}>
                {sessionComplete ? "Start new session" : "Start session"}
              </button>
              <button type="button" className="text-button" onClick={() => pickNextEntry(activeEntry?.id)}>
                Mix up words
              </button>
            </div>
          </div>
        ) : (
          <div className="learning-session__game">
            <div className="learning-session__game-header">
              <div>
                <p className="learning-session__game-label">Game</p>
                <h3>
                  {gameMode === "multiple-choice" && "Multiple choice"}
                  {gameMode === "fill-blank" && "Write the word"}
                  {gameMode === "letter-select" && "Build the word"}
                </h3>
              </div>
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

            {gameMode === "letter-select" && activeEntry ? (
              <div className="game-card game-card--compact">
                <div className="game-card__translation">{activeEntry.english}</div>
                <p className="game-card__prompt">Select each letter in order to build the word.</p>
                <div className="letter-sequence">
                  {targetLetters.map((letter, index) => (
                    <span
                      key={`${letter}-${index}`}
                      className={`letter-slot ${index < letterProgress.length ? "letter-slot--filled" : ""}`}
                    >
                      {index < letterProgress.length ? letter : "•"}
                    </span>
                  ))}
                </div>
                <div className="letter-grid">
                  {letterTiles.map((tile) => (
                    <button
                      key={tile.id}
                      type="button"
                      className="letter-button"
                      onClick={() => handleLetterPick(tile)}
                      disabled={tile.used}
                    >
                      {tile.value}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {resultCard ? (
        <div className="learning-result">
          <div className="learning-result__card">
            <div className="learning-result__media">
              {resultCard.entry.imageUrl ? (
                <img src={resultCard.entry.imageUrl} alt={`Illustration for ${resultCard.entry.german}`} />
              ) : (
                <div className="learning-session__media-placeholder" aria-hidden="true">
                  Illustration pending
                </div>
              )}
            </div>
            <div className="learning-result__content">
              <p className="learning-session__label">
                {resultCard.isCorrect ? "Nice work!" : "Keep practicing"}
              </p>
              <h3 className="learning-result__word">
                {resultCard.entry.article ? `${resultCard.entry.article} ` : ""}
                {resultCard.entry.german}
              </h3>
              <p className="learning-result__translation">{resultCard.entry.english}</p>
              <div className="learning-result__examples">
                <div>
                  <p className="learning-result__example-label">Example</p>
                  <p>{resultCard.entry.exampleDe}</p>
                  <p className="learning-result__example-translation">{resultCard.entry.exampleEn}</p>
                </div>
              </div>
              {resultCard.entry.audioUrl ? (
                <div className="learning-result__audio">
                  <span>Pronunciation</span>
                  <audio controls src={resultCard.entry.audioUrl} />
                </div>
              ) : null}
              <div className="learning-result__actions">
                <button
                  ref={continueButtonRef}
                  type="button"
                  className="primary-button"
                  onClick={handleContinue}
                >
                  {pendingSessionComplete ? "Finish session" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
