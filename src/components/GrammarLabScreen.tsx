import { useEffect, useMemo, useState } from "react";

import { generateLlmGrammarPack } from "../services/llmGrammarGenerator";
import { deleteGrammarPack, getSavedGrammarPacks, saveGrammarPack } from "../storage/grammarPackStorage";
import { GrammarLevel, GrammarPack, SavedGrammarPack } from "../types/grammarPack";
import { WordEntry } from "../types/wordEntry";
import "./GrammarLabScreen.css";

type GrammarLabScreenProps = {
  entries: WordEntry[];
};

type ExerciseFeedback = {
  status: "correct" | "incorrect";
  message: string;
};

const normalizeAnswer = (value: string) => value.trim().toLocaleLowerCase();

const LEVEL_OPTIONS: GrammarLevel[] = ["auto", "A1-A2", "B1", "B2-C1"];

export const GrammarLabScreen = ({ entries }: GrammarLabScreenProps) => {
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [formatHint, setFormatHint] = useState("");
  const [level, setLevel] = useState<GrammarLevel>("auto");
  const [useDictionaryContext, setUseDictionaryContext] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedPacks, setSavedPacks] = useState<SavedGrammarPack[]>([]);
  const [pack, setPack] = useState<GrammarPack | null>(null);
  const [llmMeta, setLlmMeta] = useState<{ model: string; generatedAt: string } | null>(null);
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, string>>({});
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<string, ExerciseFeedback>>({});

  useEffect(() => {
    setSavedPacks(getSavedGrammarPacks());
  }, []);

  const dictionaryWordsPreview = useMemo(
    () =>
      entries
        .slice(0, 20)
        .map((entry) => `${entry.article ? `${entry.article} ` : ""}${entry.german}`)
        .join(", "),
    [entries]
  );

  const canGenerate = topic.trim().length > 0 && !isGenerating;

  const resetExerciseState = (nextPack: GrammarPack | null) => {
    const nextAnswers: Record<string, string> = {};
    nextPack?.exercises.forEach((exercise) => {
      nextAnswers[exercise.id] = "";
    });
    setExerciseAnswers(nextAnswers);
    setExerciseFeedback({});
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setSaveMessage(null);

    try {
      const contextualDetails = useDictionaryContext && dictionaryWordsPreview
        ? [
            details.trim(),
            "Prefer examples that reuse these known words when reasonable:",
            dictionaryWordsPreview,
          ]
            .filter(Boolean)
            .join("\n")
        : details.trim();

      const generated = await generateLlmGrammarPack({
        topic: topic.trim(),
        details: contextualDetails,
        formatHint: formatHint.trim(),
        level,
      });

      setPack(generated.pack);
      setLlmMeta({ model: generated.llmModel, generatedAt: generated.llmGeneratedAt });
      resetExerciseState(generated.pack);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Grammar generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePack = () => {
    if (!pack) {
      return;
    }

    const saved: SavedGrammarPack = {
      id: `grammar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      llmModel: llmMeta?.model ?? null,
      llmGeneratedAt: llmMeta?.generatedAt ?? null,
      pack,
    };
    const nextSaved = saveGrammarPack(saved);
    setSavedPacks(nextSaved);
    setSaveMessage(`Saved "${pack.title}" to Grammar Lab history.`);
  };

  const handleLoadPack = (saved: SavedGrammarPack) => {
    setPack(saved.pack);
    setLlmMeta({
      model: saved.llmModel ?? "saved-pack",
      generatedAt: saved.llmGeneratedAt ?? saved.createdAt,
    });
    resetExerciseState(saved.pack);
    setSaveMessage(`Loaded "${saved.pack.title}".`);
  };

  const handleDeletePack = (id: string) => {
    const nextSaved = deleteGrammarPack(id);
    setSavedPacks(nextSaved);
  };

  const handleCheckExercise = (id: string) => {
    if (!pack) {
      return;
    }
    const exercise = pack.exercises.find((item) => item.id === id);
    if (!exercise) {
      return;
    }
    const answer = normalizeAnswer(exerciseAnswers[id] ?? "");
    const accepted = exercise.acceptedAnswers.map((item) => normalizeAnswer(item));
    const isCorrect = accepted.includes(answer);

    setExerciseFeedback((current) => ({
      ...current,
      [id]: {
        status: isCorrect ? "correct" : "incorrect",
        message: isCorrect ? "Correct." : `Expected: ${exercise.acceptedAnswers.join(" / ")}`,
      },
    }));
  };

  const handleCheckAll = () => {
    if (!pack) {
      return;
    }
    pack.exercises.forEach((exercise) => {
      handleCheckExercise(exercise.id);
    });
  };

  return (
    <section className="grammar-lab">
      <header className="grammar-lab__header">
        <div>
          <p className="grammar-lab__eyebrow">New</p>
          <h2>Grammar Lab</h2>
          <p className="grammar-lab__subhead">
            Describe what you study today. Get rules, tables, and guided blank exercises automatically.
          </p>
        </div>
      </header>

      <div className="grammar-lab__layout">
        <section className="grammar-lab__panel">
          <div className="grammar-lab__form-grid">
            <label className="field field--full">
              <span>Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. Separable vs inseparable prefixes"
              />
            </label>
            <label className="field field--full">
              <span>Focus details (optional)</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="e.g. Focus on verstehen/aufstehen with short A2 examples and common mistakes."
                rows={4}
              />
            </label>
            <label className="field">
              <span>Level</span>
              <select value={level} onChange={(event) => setLevel(event.target.value as GrammarLevel)}>
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--stretch">
              <span>Format preference (optional)</span>
              <input
                value={formatHint}
                onChange={(event) => setFormatHint(event.target.value)}
                placeholder="e.g. Keep concise with one comparison table."
              />
            </label>
          </div>

          <label className="grammar-lab__toggle">
            <input
              type="checkbox"
              checked={useDictionaryContext}
              onChange={(event) => setUseDictionaryContext(event.target.checked)}
            />
            <span>Use my dictionary words as context ({entries.length} saved)</span>
          </label>

          <div className="grammar-lab__actions">
            <button type="button" className="grammar-lab__button grammar-lab__button--primary" onClick={handleGenerate} disabled={!canGenerate}>
              {isGenerating ? "Generating..." : "Generate Grammar Pack"}
            </button>
            <button type="button" className="grammar-lab__button grammar-lab__button--ghost" onClick={handleCheckAll} disabled={!pack}>
              Check all answers
            </button>
            <button type="button" className="grammar-lab__button grammar-lab__button--ghost" onClick={handleSavePack} disabled={!pack}>
              Save pack
            </button>
          </div>

          {error ? <p className="grammar-lab__error">{error}</p> : null}
          {saveMessage ? <p className="grammar-lab__success">{saveMessage}</p> : null}
        </section>

        <aside className="grammar-lab__sidebar">
          <h3>Saved Packs</h3>
          {savedPacks.length === 0 ? (
            <p className="grammar-lab__hint">No saved packs yet.</p>
          ) : (
            <ul className="grammar-lab__saved-list">
              {savedPacks.map((saved) => (
                <li key={saved.id}>
                  <button type="button" onClick={() => handleLoadPack(saved)}>
                    {saved.pack.title}
                  </button>
                  <button
                    type="button"
                    className="grammar-lab__delete"
                    onClick={() => handleDeletePack(saved.id)}
                    aria-label={`Delete ${saved.pack.title}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {pack ? (
        <section className="grammar-lab__result">
          <header className="grammar-lab__result-header">
            <h3>{pack.title}</h3>
            {llmMeta ? (
              <p>
                {llmMeta.model} • {new Date(llmMeta.generatedAt).toLocaleString()}
              </p>
            ) : null}
          </header>

          {pack.ruleSummary.length > 0 ? (
            <article className="grammar-lab__block">
              <h4>Rule Summary</h4>
              <ul>
                {pack.ruleSummary.map((rule, index) => (
                  <li key={`rule-${index}`}>{rule}</li>
                ))}
              </ul>
            </article>
          ) : null}

          {pack.tables.map((table, index) => (
            <article className="grammar-lab__block" key={`${table.title}-${index}`}>
              <h4>{table.title}</h4>
              <div className="grammar-lab__table-wrap">
                <table>
                  <thead>
                    <tr>
                      {table.columns.map((column, columnIndex) => (
                        <th key={`${column}-${columnIndex}`}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={`${table.title}-row-${rowIndex}`}>
                        {table.columns.map((_, columnIndex) => (
                          <td key={`${table.title}-cell-${rowIndex}-${columnIndex}`}>
                            {row[columnIndex] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}

          <article className="grammar-lab__block">
            <h4>Practice Exercises</h4>
            {pack.exercises.length === 0 ? (
              <p className="grammar-lab__hint">No exercises returned for this topic.</p>
            ) : (
              <div className="grammar-lab__exercise-list">
                {pack.exercises.map((exercise, index) => {
                  const feedback = exerciseFeedback[exercise.id];
                  return (
                    <div className="grammar-lab__exercise" key={exercise.id}>
                      <p className="grammar-lab__exercise-index">Exercise {index + 1}</p>
                      <p>{exercise.instruction}</p>
                      <p className="grammar-lab__template">{exercise.sentenceTemplate}</p>
                      <p className="grammar-lab__base-word">Base word: ({exercise.baseWord})</p>
                      <div className="grammar-lab__exercise-input">
                        <input
                          value={exerciseAnswers[exercise.id] ?? ""}
                          onChange={(event) =>
                            setExerciseAnswers((current) => ({
                              ...current,
                              [exercise.id]: event.target.value,
                            }))
                          }
                          placeholder="Type your answer for the blank"
                        />
                        <button type="button" onClick={() => handleCheckExercise(exercise.id)}>
                          Check
                        </button>
                      </div>
                      {feedback ? (
                        <p
                          className={
                            feedback.status === "correct"
                              ? "grammar-lab__feedback grammar-lab__feedback--correct"
                              : "grammar-lab__feedback grammar-lab__feedback--incorrect"
                          }
                        >
                          {feedback.message}
                        </p>
                      ) : null}
                      <p className="grammar-lab__explanation">{exercise.explanation}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          {pack.studyTips.length > 0 ? (
            <article className="grammar-lab__block">
              <h4>Study Tips</h4>
              <ul>
                {pack.studyTips.map((tip, index) => (
                  <li key={`tip-${index}`}>{tip}</li>
                ))}
              </ul>
            </article>
          ) : null}
        </section>
      ) : null}
    </section>
  );
};
