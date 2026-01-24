# Germanapp

## Running the app

This repo includes a simple Vite + React scaffold. To run locally:

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

### Open on an iPhone

To view the dev server on your iPhone, run the app so it listens on your local network
and then open the host machine's IP address from Safari on the phone:

1. Start the dev server (already configured to listen on all interfaces):

   ```bash
   npm run dev
   ```

2. Find your computer's local IP address (example shown):

   - macOS: `ipconfig getifaddr en0` -> `192.168.1.25`
   - Linux: `hostname -I` -> `192.168.1.25`

3. On your iPhone (same Wi‑Fi network), open:

   ```
   http://<your-ip>:5173
   ```

If it does not load, ensure your firewall allows inbound connections to port 5173.

### LLM API key

Create a `.env` file with your key (never hardcode keys in source):

```bash
VITE_LLM_API_KEY=your-key-here
```

The app reads `VITE_LLM_API_KEY` in the browser build for card, image, and voice generation.
For server-side usage, prefer a proxy and use `LLM_API_KEY`/`OPENAI_API_KEY` on the server
environment instead.

### Sync words across devices

The app can sync the dictionary to a shared server endpoint so multiple devices see the same
word list. The client already knows how to sync if you provide a URL and optional token.

1. Start the included sync server (stores entries in `./data/word-entries.json`):

   ```bash
   npm run word-sync-server
   ```

   Optional environment variables:

   - `WORD_SYNC_PORT` (default `8787`)
   - `WORD_SYNC_TOKEN` (set to require `Authorization: Bearer <token>`)
   - `WORD_SYNC_DATA_PATH` (default `./data/word-entries.json`)

2. Add the sync settings to your `.env` file for the Vite app:

   ```bash
   VITE_WORD_SYNC_URL=http://<your-ip>:8787/words
   VITE_WORD_SYNC_TOKEN=your-shared-token
   ```

3. Run the app (`npm run dev`) on both devices. The dictionary will merge and push entries
   to the shared server so laptop and phone stay aligned.

### Store cards in your own backend

If you want to store cards in MongoDB (or any backend), implement the same simple API that the
client sync uses and then set `VITE_WORD_SYNC_URL`. See `docs/cards-storage.md` for a detailed
contract, MongoDB schema, and setup steps. The repo includes a ready-to-run backend at
`scripts/backend-server.mjs` that implements the required endpoints.

> Note: run `npm install` at the repo root before starting the backend, or Node will fail to
> resolve dependencies like `express`.

### Store images with a backend (recommended)

The browser stores images as data URLs by default, which can exceed localStorage quotas.
For a more reliable setup, upload images to a backend (MongoDB + object storage) and store
the returned URL in each entry.

1. Add these variables to your `.env` file for the Vite app:

   ```bash
   VITE_IMAGE_UPLOAD_URL=https://your-backend.example.com/api/images
   VITE_IMAGE_UPLOAD_TOKEN=your-shared-token
   ```

2. The app will POST JSON payloads like:

   ```json
   {
     "dataUrl": "data:image/png;base64,...",
     "german": "die Katze",
     "model": "gpt-image-1-mini"
   }
   ```

3. Respond with JSON including one of: `url`, `imageUrl`, or `location`:

   ```json
   { "url": "https://cdn.example.com/images/katze.png" }
   ```

When configured, the client replaces inline data URLs with the hosted URL before saving,
preventing images from disappearing due to storage limits.

The same backend server (`scripts/backend-server.mjs`) also includes the image upload endpoint.
