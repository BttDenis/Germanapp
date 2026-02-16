import { useEffect, useMemo, useRef, useState } from "react";

import {
  getLearningProgress,
  LearningProgressEntry,
  updateLearningProgress,
} from "../storage/learningProgressStorage";
import { WordEntry } from "../types/wordEntry";
import "./LearningScreen.css";

const SESSION_WORD_LIMIT = 10;
const GAME_MODES: GameMode[] = ["multiple-choice", "fill-blank", "letter-select", "grammar-choice"];
const LETTER_MISTAKE_LIMIT = 2;

type LearningScreenProps = {
  entries: WordEntry[];
};

type GameMode = "multiple-choice" | "fill-blank" | "letter-select" | "grammar-choice";

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

type MultipleChoiceOption = {
  id: string;
  label: string;
};

type GrammarFieldKey =
  | "nounPlural"
  | "nounGenitive"
  | "verbThirdPerson"
  | "verbPast"
  | "verbParticipleIi"
  | "verbAuxiliary"
  | "adjectiveComparative"
  | "adjectiveSuperlative";

type GrammarFact = {
  label: string;
  value: string;
};

type GrammarPrompt = {
  field: GrammarFieldKey;
  question: string;
  answer: string;
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

const normalizeGermanAnswer = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/^(der|die|das)\s+/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

const normalizeAnswer = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase();

const toDisplayValue = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim();
  return normalized || "Not set";
};

const getGrammarFieldValue = (entry: WordEntry, field: GrammarFieldKey): string => {
  switch (field) {
    case "nounPlural":
      return (entry.nounPlural ?? "").trim();
    case "nounGenitive":
      return (entry.nounGenitive ?? "").trim();
    case "verbThirdPerson":
      return (entry.verbThirdPerson ?? "").trim();
    case "verbPast":
      return (entry.verbPast ?? "").trim();
    case "verbParticipleIi":
      return (entry.verbParticipleIi ?? "").trim();
    case "verbAuxiliary":
      return (entry.verbAuxiliary ?? "").trim();
    case "adjectiveComparative":
      return (entry.adjectiveComparative ?? "").trim();
    case "adjectiveSuperlative":
      return (entry.adjectiveSuperlative ?? "").trim();
    default:
      return "";
  }
};

const getGrammarFacts = (entry: WordEntry, includeMissing = false): GrammarFact[] => {
  if (entry.partOfSpeech === "noun") {
    const facts: GrammarFact[] = [
      { label: "Plural", value: toDisplayValue(entry.nounPlural) },
      { label: "Genitive", value: toDisplayValue(entry.nounGenitive) },
    ];
    return includeMissing ? facts : facts.filter((fact) => fact.value !== "Not set");
  }
  if (entry.partOfSpeech === "verb") {
    const facts: GrammarFact[] = [
      { label: "3rd person", value: toDisplayValue(entry.verbThirdPerson) },
      { label: "Past", value: toDisplayValue(entry.verbPast) },
      { label: "Participle II", value: toDisplayValue(entry.verbParticipleIi) },
      { label: "Auxiliary", value: toDisplayValue(entry.verbAuxiliary) },
    ];
    return includeMissing ? facts : facts.filter((fact) => fact.value !== "Not set");
  }
  if (entry.partOfSpeech === "adj") {
    const facts: GrammarFact[] = [
      { label: "Comparative", value: toDisplayValue(entry.adjectiveComparative) },
      { label: "Superlative", value: toDisplayValue(entry.adjectiveSuperlative) },
    ];
    return includeMissing ? facts : facts.filter((fact) => fact.value !== "Not set");
  }
  return [];
};

const buildGrammarPrompt = (entry: WordEntry): GrammarPrompt | null => {
  if (entry.partOfSpeech === "noun") {
    if ((entry.nounPlural ?? "").trim()) {
      return {
        field: "nounPlural",
        question: `Choose the plural form of "${entry.article ? `${entry.article} ` : ""}${entry.german}".`,
        answer: entry.nounPlural ?? "",
      };
    }
    if ((entry.nounGenitive ?? "").trim()) {
      return {
        field: "nounGenitive",
        question: `Choose the genitive form of "${entry.article ? `${entry.article} ` : ""}${entry.german}".`,
        answer: entry.nounGenitive ?? "",
      };
    }
    return null;
  }

  if (entry.partOfSpeech === "verb") {
    if ((entry.verbParticipleIi ?? "").trim()) {
      return {
        field: "verbParticipleIi",
        question: `Choose the participle II form of "${entry.german}".`,
        answer: entry.verbParticipleIi ?? "",
      };
    }
    if ((entry.verbPast ?? "").trim()) {
      return {
        field: "verbPast",
        question: `Choose the past (Prateritum) form of "${entry.german}".`,
        answer: entry.verbPast ?? "",
      };
    }
    if ((entry.verbThirdPerson ?? "").trim()) {
      return {
        field: "verbThirdPerson",
        question: `Choose the 3rd person singular present form of "${entry.german}".`,
        answer: entry.verbThirdPerson ?? "",
      };
    }
    if ((entry.verbAuxiliary ?? "").trim()) {
      return {
        field: "verbAuxiliary",
        question: `Choose the auxiliary verb used with "${entry.german}" in Perfekt.`,
        answer: entry.verbAuxiliary ?? "",
      };
    }
    return null;
  }

  if (entry.partOfSpeech === "adj") {
    if ((entry.adjectiveComparative ?? "").trim()) {
      return {
        field: "adjectiveComparative",
        question: `Choose the comparative form of "${entry.german}".`,
        answer: entry.adjectiveComparative ?? "",
      };
    }
    if ((entry.adjectiveSuperlative ?? "").trim()) {
      return {
        field: "adjectiveSuperlative",
        question: `Choose the superlative form of "${entry.german}".`,
        answer: entry.adjectiveSuperlative ?? "",
      };
    }
  }
  return null;
};

const pickWeightedEntry = (
  candidates: WordEntry[],
  progressMap: Record<string, LearningProgressEntry>,
): WordEntry => {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const todayKey = new Date().toDateString();
  const getWeight = (entry: WordEntry) => {
    const progress = progressMap[entry.id];
    if (!progress) {
      return 3.2;
    }
    let weight = 1 + (100 - progress.strength) / 35;
    if (formatDateKey(progress.lastReviewedAt) !== todayKey) {
      weight += 0.8;
    }
    if (progress.totalReviews < 3) {
      weight += 0.5;
    }
    if (progress.correctStreak === 0) {
      weight += 0.4;
    }
    return Math.max(0.2, weight);
  };

  const totalWeight = candidates.reduce((sum, entry) => sum + getWeight(entry), 0);
  if (totalWeight <= 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let threshold = Math.random() * totalWeight;
  for (const entry of candidates) {
    threshold -= getWeight(entry);
    if (threshold <= 0) {
      return entry;
    }
  }
  return candidates[candidates.length - 1];
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
  const [letterMistakes, setLetterMistakes] = useState(0);
  const [letterFeedback, setLetterFeedback] = useState<string | null>(null);
  const [blockedLetterTileIds, setBlockedLetterTileIds] = useState<number[]>([]);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoAudioRef = useRef<HTMLAudioElement | null>(null);

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
    const next = pickWeightedEntry(options.length ? options : entries, progressMap);
    setActiveEntryId(next.id);
    setFillAnswer("");
    setResultCard(null);
    setPendingSessionComplete(false);
    setLetterMistakes(0);
    setLetterFeedback(null);
    setBlockedLetterTileIds([]);
    setGameMode((currentMode) => {
      const supportsGrammarMode = Boolean(buildGrammarPrompt(next));
      const allowedModes = supportsGrammarMode
        ? GAME_MODES
        : GAME_MODES.filter((mode) => mode !== "grammar-choice");
      const options = allowedModes.filter((mode) => mode !== currentMode);
      return (
        options[Math.floor(Math.random() * options.length)] ??
        allowedModes[0] ??
        currentMode
      );
    });
  };

  const playEntryAudio = (audioUrl?: string | null) => {
    if (!audioUrl || typeof Audio === "undefined") {
      return;
    }
    try {
      if (autoAudioRef.current) {
        autoAudioRef.current.pause();
        autoAudioRef.current.currentTime = 0;
      }
      const audio = new Audio(audioUrl);
      autoAudioRef.current = audio;
      void audio.play().catch(() => {
        // Ignore autoplay errors; user can still play manually.
      });
    } catch {
      // Ignore media playback setup failures.
    }
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
    playEntryAudio(activeEntry.audioUrl);
    setResultCard({ entry: activeEntry, isCorrect });

    if (nextReviewed >= SESSION_WORD_LIMIT) {
      setPendingSessionComplete(true);
    }
  };

  const handleMultipleChoice = (selectedId: string) => {
    if (!activeEntry) {
      return;
    }
    const isCorrect = selectedId === activeEntry.id;
    handleReview(isCorrect);
  };

  const handleFillSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEntry) {
      return;
    }
    const normalized = normalizeGermanAnswer(fillAnswer);
    const acceptedAnswers = new Set<string>([
      normalizeGermanAnswer(activeEntry.german),
      normalizeGermanAnswer(`${activeEntry.article ?? ""} ${activeEntry.german}`),
    ]);
    const isCorrect = acceptedAnswers.has(normalized);
    handleReview(isCorrect);
  };

  const handleGrammarChoice = (selected: string) => {
    if (!grammarPrompt) {
      return;
    }
    const isCorrect = normalizeAnswer(selected) === normalizeAnswer(grammarPrompt.answer);
    handleReview(isCorrect);
  };

  const multipleChoiceOptions = useMemo<MultipleChoiceOption[]>(() => {
    if (!activeEntry) {
      return [];
    }
    const distractors = shuffle(
      entries.filter((entry) => entry.id !== activeEntry.id && entry.english.trim() !== ""),
    ).slice(0, 3);
    return shuffle([activeEntry, ...distractors]).map((entry) => ({
      id: entry.id,
      label: entry.english || entry.german,
    }));
  }, [activeEntry, entries]);

  const grammarPrompt = useMemo<GrammarPrompt | null>(() => {
    if (!activeEntry) {
      return null;
    }
    return buildGrammarPrompt(activeEntry);
  }, [activeEntry]);

  const grammarChoiceOptions = useMemo<string[]>(() => {
    if (!activeEntry || !grammarPrompt) {
      return [];
    }

    const answer = grammarPrompt.answer.trim();
    if (!answer) {
      return [];
    }

    if (grammarPrompt.field === "verbAuxiliary") {
      return shuffle(Array.from(new Set([answer, "haben", "sein"])));
    }

    const distractors = shuffle(
      entries
        .filter((entry) => entry.id !== activeEntry.id && entry.partOfSpeech === activeEntry.partOfSpeech)
        .map((entry) => getGrammarFieldValue(entry, grammarPrompt.field))
        .map((value) => value.trim())
        .filter((value) => value && normalizeAnswer(value) !== normalizeAnswer(answer)),
    ).slice(0, 3);

    return shuffle(Array.from(new Set([answer, ...distractors])));
  }, [activeEntry, entries, grammarPrompt]);

  const resultEntryGrammarFacts = useMemo<GrammarFact[]>(() => {
    if (!resultCard) {
      return [];
    }
    return getGrammarFacts(resultCard.entry, true);
  }, [resultCard]);

  useEffect(() => {
    if (gameMode === "grammar-choice" && !grammarPrompt) {
      setGameMode("multiple-choice");
    }
  }, [gameMode, grammarPrompt]);

  const sessionAccuracy = sessionStats.reviewed
    ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
    : 0;
  const sessionRemaining = Math.max(SESSION_WORD_LIMIT - sessionStats.reviewed, 0);
  const letterMistakesRemaining = Math.max(LETTER_MISTAKE_LIMIT - letterMistakes, 0);

  const handleStartSession = () => {
    setSessionStats({ reviewed: 0, correct: 0 });
    setSessionActive(true);
    setSessionComplete(false);
    setSessionNote(null);
    setResultCard(null);
    setPendingSessionComplete(false);
    setLetterMistakes(0);
    setLetterFeedback(null);
    setBlockedLetterTileIds([]);
    pickNextEntry(activeEntry?.id);
  };

  const handleEndSession = (note: string) => {
    setSessionActive(false);
    setSessionComplete(true);
    setSessionNote(note);
    setFillAnswer("");
    setResultCard(null);
    setPendingSessionComplete(false);
    setLetterMistakes(0);
    setLetterFeedback(null);
    setBlockedLetterTileIds([]);
  };

  useEffect(() => {
    if (!activeEntry || gameMode !== "letter-select") {
      setLetterTiles([]);
      setLetterProgress([]);
      setLetterMistakes(0);
      setLetterFeedback(null);
      setBlockedLetterTileIds([]);
      return;
    }
    const target = Array.from(activeEntry.german.replace(/[^\p{L}]/gu, ""));
    setLetterTiles(shuffle(target).map((value, index) => ({ id: index, value, used: false })));
    setLetterProgress([]);
    setLetterMistakes(0);
    setLetterFeedback(null);
    setBlockedLetterTileIds([]);
  }, [activeEntry, gameMode]);

  useEffect(() => {
    return () => {
      if (autoAudioRef.current) {
        autoAudioRef.current.pause();
        autoAudioRef.current.currentTime = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!resultCard) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    continueButtonRef.current?.focus();
  }, [resultCard]);

  const targetLetters = useMemo(() => {
    if (!activeEntry) {
      return [];
    }
    return Array.from(activeEntry.german.replace(/[^\p{L}]/gu, ""));
  }, [activeEntry]);

  const handleLetterPick = (tile: LetterTile) => {
    if (!activeEntry || tile.used || blockedLetterTileIds.includes(tile.id) || resultCard) {
      return;
    }
    const expectedLetter = targetLetters[letterProgress.length];
    if (!expectedLetter) {
      return;
    }
    if (tile.value !== expectedLetter) {
      setBlockedLetterTileIds((current) =>
        current.includes(tile.id) ? current : [...current, tile.id]
      );
      const nextMistakes = letterMistakes + 1;
      setLetterMistakes(nextMistakes);
      if (nextMistakes > LETTER_MISTAKE_LIMIT) {
        setLetterFeedback("Mistake limit reached. Round failed.");
        handleReview(false);
        return;
      }
      if (nextMistakes === LETTER_MISTAKE_LIMIT) {
        setLetterFeedback("Mistake noted. Next mistake will end this round.");
        return;
      }
      setLetterFeedback(`Mistake noted. ${LETTER_MISTAKE_LIMIT - nextMistakes} free mistake left.`);
      return;
    }

    setLetterTiles((current) =>
      current.map((item) => (item.id === tile.id ? { ...item, used: true } : item)),
    );
    setLetterFeedback(null);
    setBlockedLetterTileIds([]);
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
            &times;
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
              <span>{summary.learning} learning, {summary.needsPractice} need practice</span>
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
                  {gameMode === "grammar-choice" && "Grammar challenge"}
                </h3>
              </div>
            </div>
            <div className="learning-session__session-meta">
              <p>
                {sessionStats.reviewed}/{SESSION_WORD_LIMIT} reviewed
              </p>
              <span>{sessionStats.correct} correct</span>
              <span>{sessionAccuracy}% accuracy</span>
              <span>{sessionRemaining} remaining</span>
              <button
                type="button"
                className="text-button"
                onClick={() => pickNextEntry(activeEntry?.id)}
                disabled={Boolean(resultCard)}
              >
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
                      key={option.id}
                      type="button"
                      className="choice-button"
                      onClick={() => handleMultipleChoice(option.id)}
                      disabled={Boolean(resultCard)}
                    >
                      {option.label}
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
                    disabled={Boolean(resultCard)}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!fillAnswer.trim() || Boolean(resultCard)}
                  >
                    Check answer
                  </button>
                </form>
              </div>
            ) : null}

            {gameMode === "grammar-choice" && activeEntry && grammarPrompt ? (
              <div className="game-card game-card--compact">
                <div className="game-card__translation">
                  {activeEntry.article ? `${activeEntry.article} ` : ""}
                  {activeEntry.german}
                  {" - "}
                  {activeEntry.english}
                </div>
                <p className="game-card__prompt">{grammarPrompt.question}</p>
                <div className="choice-grid">
                  {grammarChoiceOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="choice-button"
                      onClick={() => handleGrammarChoice(option)}
                      disabled={Boolean(resultCard)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {gameMode === "letter-select" && activeEntry ? (
              <div className="game-card game-card--compact">
                <div className="game-card__translation">{activeEntry.english}</div>
                <p className="game-card__prompt">Select each letter in order to build the word.</p>
                <div className="letter-status">
                  <span>
                    Mistakes used: {letterMistakes}/{LETTER_MISTAKE_LIMIT}
                  </span>
                  {letterFeedback ? (
                    <span className="letter-status__feedback letter-status__feedback--warning">
                      {letterFeedback}
                    </span>
                  ) : (
                    <span>{letterMistakesRemaining} free mistakes left</span>
                  )}
                </div>
                <div className="letter-sequence">
                  {targetLetters.map((letter, index) => (
                    <span
                      key={`${letter}-${index}`}
                      className={`letter-slot ${index < letterProgress.length ? "letter-slot--filled" : ""}`}
                    >
                      {index < letterProgress.length ? letter : "_"}
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
                      disabled={tile.used || blockedLetterTileIds.includes(tile.id) || Boolean(resultCard)}
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
          <div
            className={`learning-result__card ${
              resultCard.isCorrect ? "learning-result__card--correct" : "learning-result__card--incorrect"
            }`}
          >
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
              <p
                className={`learning-session__label ${
                  resultCard.isCorrect ? "learning-session__label--correct" : "learning-session__label--incorrect"
                }`}
              >
                {resultCard.isCorrect ? "Nice work!" : "Keep practicing"}
              </p>
              <h3 className="learning-result__word">
                {resultCard.entry.article ? `${resultCard.entry.article} ` : ""}
                {resultCard.entry.german}
              </h3>
              <p className="learning-result__translation">{resultCard.entry.english}</p>
              {resultEntryGrammarFacts.length > 0 ? (
                <div className="learning-grammar learning-grammar--result">
                  <p className="learning-grammar__title">Grammar details</p>
                  <div className="learning-grammar__grid">
                    {resultEntryGrammarFacts.map((fact) => (
                      <div key={fact.label} className="learning-grammar__item">
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
