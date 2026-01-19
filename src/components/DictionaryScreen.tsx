import { WordEntry } from "../types/wordEntry";
import { COMMON_WORD_BATCH_SIZE } from "../utils/commonWordSeed";
import "./DictionaryScreen.css";

type DictionaryScreenProps = {
  entries: WordEntry[];
  onClearEntries?: () => void;
  onAddCommonWords?: () => void;
};

export const DictionaryScreen = ({
  entries,
  onClearEntries,
  onAddCommonWords,
}: DictionaryScreenProps) => {
  if (entries.length === 0) {
    return (
      <section className="dictionary-screen dictionary-screen--empty">
        <h2>Dictionary</h2>
        <p>Your saved words will appear here once you add them.</p>
        {onAddCommonWords ? (
          <div className="dictionary-screen__empty-actions">
            <p>Start faster with the most common words.</p>
            <button type="button" className="primary" onClick={onAddCommonWords}>
              Add {COMMON_WORD_BATCH_SIZE} common words
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="dictionary-screen">
      <header className="dictionary-screen__header">
        <div>
          <p className="dictionary-screen__eyebrow">Saved words</p>
          <h2>Dictionary</h2>
          <p className="dictionary-screen__subhead">
            Review every word you have saved so far, newest entries at the top.
          </p>
        </div>
        <div className="dictionary-screen__actions">
          <span className="dictionary-screen__count">{entries.length} total</span>
          {onAddCommonWords ? (
            <button type="button" className="dictionary-screen__seed" onClick={onAddCommonWords}>
              Add {COMMON_WORD_BATCH_SIZE} common words
            </button>
          ) : null}
          {onClearEntries ? (
            <button
              type="button"
              className="dictionary-screen__clear"
              onClick={onClearEntries}
            >
              Clear all words
            </button>
          ) : null}
        </div>
      </header>
      <div className="dictionary-screen__list">
        {entries.map((entry) => (
          <article className="dictionary-card" key={entry.id}>
            <header>
              <p className="dictionary-card__german">
                {entry.article ? `${entry.article} ${entry.german}` : entry.german}
              </p>
              <p className="dictionary-card__english">{entry.english}</p>
            </header>
            <div className="dictionary-card__meta">
              <span>{entry.partOfSpeech}</span>
              <span>{entry.source === "llm" ? "LLM-assisted" : "Manual"}</span>
              {entry.llmModel ? <span>{entry.llmModel}</span> : null}
            </div>
            <div className="dictionary-card__examples">
              <p>{entry.exampleDe}</p>
              <p className="dictionary-card__translation">{entry.exampleEn}</p>
            </div>
            {entry.notes ? <p className="dictionary-card__notes">{entry.notes}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
};
