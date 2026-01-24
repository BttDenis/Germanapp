# Card storage backend (MongoDB)

This app already supports syncing cards (word entries) to a backend via a simple HTTP API.
To connect your own backend right now, implement the API contract below and configure the
Vite env variables.

## Quick start (client setup)

1. Add the backend URL (and optional token) to `.env`:

   ```bash
   VITE_WORD_SYNC_URL=https://your-backend.example.com/api/words
   VITE_WORD_SYNC_TOKEN=your-shared-token
   ```

2. Run the app (`npm run dev`). It will:
   - **GET** the entries at startup and merge into local storage.
   - **PUT** the merged list back to the backend.
   - **PUT** updates as you add/edit cards.

## Backend in this repo

This repo ships a MongoDB-backed backend server at `scripts/backend-server.mjs` that already
implements the `/api/words` endpoints. Configure a `.env` file for the backend process:

```bash
PORT=8787
MONGODB_URI=mongodb://localhost:27017/germanapp
MONGODB_DB=germanapp
WORD_SYNC_TOKEN=your-shared-token
```

Run it with:

```bash
npm install
npm run backend-server
```

## API contract (minimal)

**GET** `/api/words` → return a JSON array of entries:

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
    "llmGeneratedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**PUT** `/api/words` → accept the full array and overwrite storage:

```json
[
  { "id": "entry-123", "german": "die Katze", "english": "cat", "partOfSpeech": "noun" }
]
```

The client sends/receives the full list, so the backend can store it as a single document or
as individual entries.

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
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Backend implementation notes

- Validate the bearer token if you set `VITE_WORD_SYNC_TOKEN`.
- You can either:
  - **Store the full list** as one document (simpler).
  - **Upsert each entry** by `id` (better for growth).
- Keep the response body exactly an array of entries.

## How this connects in the app

The sync logic lives in `src/services/wordEntriesSync.ts`. On app load it:

1. Fetches `/api/words` (`GET`).
2. Merges entries with local storage.
3. Pushes the merged list back to the backend (`PUT`).

After that, the app periodically pushes updates. This is why you need the two endpoints and
why the payload is a full array.
