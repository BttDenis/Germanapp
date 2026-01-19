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
