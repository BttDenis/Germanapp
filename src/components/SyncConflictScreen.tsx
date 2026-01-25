import { SyncConflict } from "../services/wordEntriesSync";
import { WordEntry } from "../types/wordEntry";

type SyncConflictScreenProps = {
  conflicts: SyncConflict[];
  onResolve: (conflictId: string, action: "local" | "remote" | "merge") => void;
};

const renderEntryDetails = (entry: WordEntry | null) => {
  if (!entry) {
    return <p className="sync-conflicts__empty">No entry available.</p>;
  }

  return (
    <dl className="sync-conflicts__details">
      <div>
        <dt>German</dt>
        <dd>{entry.german}</dd>
      </div>
      <div>
        <dt>English</dt>
        <dd>{entry.english}</dd>
      </div>
      <div>
        <dt>Part of speech</dt>
        <dd>{entry.partOfSpeech}</dd>
      </div>
      <div>
        <dt>Example</dt>
        <dd>{entry.exampleDe || "—"}</dd>
      </div>
      <div>
        <dt>Notes</dt>
        <dd>{entry.notes || "—"}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>{new Date(entry.updatedAt).toLocaleString()}</dd>
      </div>
    </dl>
  );
};

export const SyncConflictScreen = ({ conflicts, onResolve }: SyncConflictScreenProps) => {
  return (
    <section className="sync-conflicts" role="dialog" aria-live="polite">
      <div className="sync-conflicts__card">
        <h2>Resolve sync conflicts</h2>
        <p>
          Another device updated the same entries. Choose which version to keep before the next sync.
        </p>
        <div className="sync-conflicts__list">
          {conflicts.map((conflict) => (
            <article key={conflict.id} className="sync-conflicts__item">
              <div className="sync-conflicts__columns">
                <div>
                  <h3>Local</h3>
                  {renderEntryDetails(conflict.local)}
                </div>
                <div>
                  <h3>Remote</h3>
                  {renderEntryDetails(conflict.remote)}
                </div>
              </div>
              <div className="sync-conflicts__actions">
                <button type="button" onClick={() => onResolve(conflict.id, "local")}>
                  Keep local
                </button>
                <button type="button" onClick={() => onResolve(conflict.id, "remote")}>
                  Keep remote
                </button>
                {conflict.type === "update" ? (
                  <button type="button" onClick={() => onResolve(conflict.id, "merge")}>
                    Merge
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
