# Germanapp

## Running the app

This repo includes a simple Vite + React scaffold. To run locally:

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

### LLM API key

Create a `.env` file with your key (never hardcode keys in source):

```bash
VITE_LLM_API_KEY=your-key-here
```

The app reads `VITE_LLM_API_KEY` in the browser build. For server-side usage, prefer a proxy
and use `LLM_API_KEY`/`OPENAI_API_KEY` on the server environment instead.
