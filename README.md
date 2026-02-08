# Germanapp

German vocabulary trainer built with Vite + React + TypeScript, with an optional
Express + MongoDB backend for cross-device sync and media uploads.

## Local development

Install dependencies:

```bash
npm install
```

Start frontend:

```bash
npm run dev
```

Start backend (requires MongoDB):

```bash
npm run backend-server
```

Frontend default URL: `http://localhost:5173`  
Backend default URL: `http://localhost:8787`

## Environment variables

Copy `.env.example` to `.env` and set only the values you need.

Frontend (`VITE_*`) variables:

- `VITE_LLM_BACKEND_URL`: backend base URL used for generation endpoints (example: `https://api.example.com`).
- `VITE_LLM_BACKEND_TOKEN`: optional token for `/api/llm/*` endpoints (falls back to `VITE_WORD_SYNC_TOKEN` when unset).
- `VITE_WORD_SYNC_URL`: backend words endpoint (example: `https://api.example.com/api/words`).
- `VITE_WORD_SYNC_TOKEN`: token for sync requests.

Backend variables:

- `MONGODB_URI` (required): MongoDB connection string.
- `MONGODB_DB`: database name (`germanapp` default).
- `PORT`: server port (`8787` default).
- `WORD_SYNC_TOKEN`: bearer token for `/api/words` and `/api/words/sync`.
- `LLM_PROXY_TOKEN`: optional bearer token for `/api/llm/*` (falls back to `WORD_SYNC_TOKEN`).
- `LLM_API_KEY` or `OPENAI_API_KEY`: server-side OpenAI key used for card/image/voice generation.
- `OPENAI_API_BASE_URL`: OpenAI API base URL (`https://api.openai.com/v1` default).
- `OPENAI_CHAT_MODEL`: backend default model for cards (`gpt-4o-mini` default).
- `OPENAI_IMAGE_MODEL`: backend default model for images (`gpt-image-1-mini` default).
- `OPENAI_IMAGE_QUALITY`: backend default image quality (`low` default).
- `OPENAI_IMAGE_SIZE`: backend default image size (`1024x1024` default).
- `OPENAI_TTS_MODEL`: backend default TTS model (`gpt-4o-mini-tts` default).
- `OPENAI_TTS_VOICE`: backend default TTS voice (`alloy` default).
- `IMAGE_UPLOAD_TOKEN`: bearer token for `/api/images`.
- `AUDIO_UPLOAD_TOKEN`: bearer token for `/api/audio` (falls back to `IMAGE_UPLOAD_TOKEN`).
- `IMAGE_STORAGE_PATH`: folder used for uploaded files (`./uploads` default).
- `PUBLIC_IMAGE_BASE_URL`: optional public base URL for uploaded images.
- `PUBLIC_AUDIO_BASE_URL`: optional public base URL for uploaded audio.
- `CORS_ORIGIN`: comma-separated allowlist (example: `https://app.example.com`).
- `REQUEST_BODY_LIMIT`: JSON body size limit (`10mb` default).

## Production deployment

Use two deploy targets:

1. Backend server (`npm start`) on a Node host with MongoDB access.
2. Frontend static bundle (`npm run build`, deploy `dist/`) on a static host.

Set the frontend `VITE_*` URLs to your public backend domain and rebuild before deploying.

Detailed guide: `deploy.md`.

## API endpoints

- `GET /health`
- `GET /api/words`
- `PUT /api/words`
- `POST /api/words/sync`
- `POST /api/llm/card`
- `POST /api/llm/image`
- `POST /api/llm/voice`
- `POST /api/images`
- `POST /api/audio`
- `GET /uploads/<filename>`
