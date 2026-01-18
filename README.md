# Germanapp

## Running the app

This repo includes a simple Vite + React scaffold. To run locally:

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

### LLM API key

Create a `.env` file with your key (never hardcode keys in source). If you are using OpenAI,
you can reuse the same API key for chat, image, and TTS calls:

```bash
VITE_LLM_API_KEY=your-openai-key-here
# Optional: override specific models used by the app (if you wire them in later)
VITE_OPENAI_CHAT_MODEL=gpt-4o-mini
VITE_OPENAI_IMAGE_MODEL=gpt-image-1
VITE_OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

The app reads `VITE_LLM_API_KEY` in the browser build. For server-side usage, prefer a proxy
and use `LLM_API_KEY`/`OPENAI_API_KEY` on the server environment instead.

> Note: For security, never share or commit API keys. Create keys in your OpenAI account
> dashboard and store them in `.env` locally or secure storage on device.
