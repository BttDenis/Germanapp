# Card storage backend (MongoDB)

This app supports syncing cards (word entries) to a backend via a delta sync HTTP API.
To connect your own backend right now, implement the API contract below and configure the
Vite env variables.

## Quick start (client setup)

1. Add the backend URL (and optional token) to `.env`:

   ```bash
   VITE_WORD_SYNC_URL=https://your-backend.example.com/api/words
   VITE_WORD_SYNC_TOKEN=your-shared-token
   ```

2. Run the app (`npm run dev`). It will:
   - **POST** `/api/words/sync` at startup to exchange deltas and merge into local storage.
   - **POST** `/api/words/sync` as you add/edit/delete cards.

## Backend in this repo

This repo ships a MongoDB-backed backend server at `scripts/backend-server.mjs` that already
implements the `/api/words` and `/api/words/sync` endpoints. Configure a `.env` file for the backend process:

```bash
PORT=8787
MONGODB_URI=mongodb://localhost:27017/germanapp
MONGODB_DB=germanapp
WORD_SYNC_TOKEN=your-shared-token
```

Run it with:

```bash
npm run backend-server
```

## API contract (minimal)

**GET** `/api/words` → return a JSON array of entries (optional, useful for debugging):

```json
[
  {
    "id": "entry-123",
    "german": "die Katze",
    "english": "cat",
    "partOfSpeech": "noun",
    "article": "die",
    "exampleDe": "Die Katze schläft.",
    "exampleEn": "The cat sleeps.",
    "notes": "",
    "imageUrl": "https://cdn.example.com/images/katze.png",
    "audioUrl": "https://cdn.example.com/audio/katze.mp3",
    "source": "llm",
    "llmModel": "gpt-4.1-mini",
    "llmGeneratedAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "clientId": "client-abc123"
  }
]
```

**POST** `/api/words/sync` → accept deltas and return updates since `since`:

```json
{
  "clientId": "client-abc123",
  "since": "2024-01-10T12:00:00.000Z",
  "entries": [
    {
      "id": "entry-123",
      "german": "die Katze",
      "english": "cat",
      "partOfSpeech": "noun",
      "updatedAt": "2024-01-10T12:01:00.000Z",
      "clientId": "client-abc123"
    }
  ],
  "deletedIds": ["entry-999"]
}
```

The backend merges entries by `updatedAt` and returns the changes since the `since` timestamp,
plus any conflicts for the UI to resolve.

Example response:

```json
{
  "entries": [
    {
      "id": "entry-123",
      "german": "die Katze",
      "english": "cat",
      "partOfSpeech": "noun",
      "updatedAt": "2024-01-10T12:02:00.000Z",
      "clientId": "client-remote"
    }
  ],
  "deletedIds": [],
  "serverTime": "2024-01-10T12:05:00.000Z",
  "conflicts": [
    {
      "id": "entry-456",
      "type": "update",
      "local": { "id": "entry-456", "german": "die Maus", "english": "mouse" },
      "remote": { "id": "entry-456", "german": "die Maus", "english": "mouse", "notes": "Updated elsewhere" }
    }
  ]
}
```

## Suggested MongoDB schema

You can store entries in a single collection like `wordEntries`:

```json
{
  "_id": "entry-123",
  "german": "die Katze",
  "english": "cat",
  "partOfSpeech": "noun",
  "article": "die",
  "exampleDe": "Die Katze schläft.",
  "exampleEn": "The cat sleeps.",
  "notes": "",
  "imageUrl": "https://cdn.example.com/images/katze.png",
  "audioUrl": "https://cdn.example.com/audio/katze.mp3",
  "source": "llm",
  "llmModel": "gpt-4.1-mini",
  "llmGeneratedAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "clientId": "client-abc123"
  }
```

## Backend implementation notes

- Validate the bearer token if you set `VITE_WORD_SYNC_TOKEN`.
- You can either:
  - **Store the full list** as one document (simpler).
  - **Upsert each entry** by `id` (better for growth).
- Keep the response body for `/api/words/sync` as a JSON object with `entries`, `deletedIds`,
  `serverTime`, and `conflicts`.

## Storage & scalability improvements (MongoDB + client)

These suggestions keep MongoDB as the source of truth while improving client resilience and backend
performance:

- **Move client entries to IndexedDB** instead of `localStorage` to raise size limits and reduce
  quota errors during sync merges. Keep the same API shape but use IndexedDB as the backing store.
- **Upload audio URLs** to the backend (similar to images) so large data URLs do not exceed browser
  storage limits. Store the hosted URL in the entry.
- **Prune the image cache automatically** by size or last access to prevent unbounded growth on the
  client.

## Backend indexes & audit logs

To keep MongoDB performant and observable as data grows:

- Add indexes on `wordEntries`: `{ _id: 1 }`, `{ german: 1 }`, `{ updatedAt: -1 }`.
- Add indexes on `imageAssets`: `{ word: 1 }`, `{ createdAt: -1 }`.
- Add an audit log collection (e.g., `wordEntryAudit`) that stores insert/update events with
  timestamps, payload diffs, and source identifiers to investigate sync anomalies.

## How this connects in the app

The sync logic lives in `src/services/wordEntriesSync.ts`. On app load it:

1. Posts local deltas to `/api/words/sync`.
2. Applies remote deltas to local storage.
3. Surfaces any conflicts for manual resolution.

After that, the app periodically sends deltas instead of the full list.
