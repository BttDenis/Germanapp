import { WordEntry } from "../types/wordEntry";
import "./DictionaryScreen.css";

type DictionaryScreenProps = {
  entries: WordEntry[];
};

export const DictionaryScreen = ({ entries }: DictionaryScreenProps) => {
  if (entries.length === 0) {
    return (
      <section className="dictionary-screen dictionary-screen--empty">
        <h2>Dictionary</h2>
        <p>Your saved words will appear here once you add them.</p>
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
        <span className="dictionary-screen__count">{entries.length} total</span>
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
