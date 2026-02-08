# Deployment Guide (Frontend + Backend)

This guide gives one deployment path for using the app outside your home network.

## 1. Architecture

- Frontend: static files from `dist/` (Netlify, Vercel, Cloudflare Pages, S3+CloudFront, etc.).
- Backend: Node server from `scripts/backend-server.mjs` (Render, Railway, Fly.io, VM, etc.).
- Database: MongoDB (Atlas recommended).

## 2. Backend deploy

### 2.1 Required environment variables

```bash
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority
MONGODB_DB=germanapp
PORT=8787
WORD_SYNC_TOKEN=<strong-random-token>
LLM_PROXY_TOKEN=<strong-random-token>
LLM_API_KEY=<openai-api-key>
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_IMAGE_MODEL=gpt-image-1-mini
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
IMAGE_UPLOAD_TOKEN=<strong-random-token>
AUDIO_UPLOAD_TOKEN=<strong-random-token>
IMAGE_STORAGE_PATH=./uploads
PUBLIC_IMAGE_BASE_URL=https://api.example.com/uploads
PUBLIC_AUDIO_BASE_URL=https://api.example.com/uploads
CORS_ORIGIN=https://app.example.com
REQUEST_BODY_LIMIT=10mb
```

### 2.2 Start command

```bash
npm install
npm start
```

`npm start` runs `node ./scripts/backend-server.mjs`.

### 2.3 Verify backend

Run these checks against your deployed backend URL:

```bash
curl https://api.example.com/health
curl https://api.example.com/
```

Expected:

- `/health` returns `{"status":"ok"}`
- `/` returns endpoint index JSON

## 3. Frontend deploy

### 3.1 Frontend environment variables

Set these in your frontend host (or `.env.production` before build):

```bash
VITE_LLM_BACKEND_URL=https://api.example.com
VITE_LLM_BACKEND_TOKEN=<LLM_PROXY_TOKEN>
VITE_WORD_SYNC_URL=https://api.example.com/api/words
VITE_WORD_SYNC_TOKEN=<WORD_SYNC_TOKEN>
```

### 3.2 Build and publish

```bash
npm install
npm run build
```

Deploy the generated `dist/` folder to your static host.

## 4. End-to-end validation

1. Open deployed frontend (`https://app.example.com`).
2. Add a word and refresh.
3. Open the app on a second device and confirm sync.
4. Generate image/audio and confirm URLs load from backend `uploads`.

## 5. Common failures

- `401 Unauthorized`: token mismatch between frontend and backend env.
- `CORS` errors: frontend domain missing from `CORS_ORIGIN`.
- `413 Payload Too Large`: increase `REQUEST_BODY_LIMIT`.
- LLM generation returns backend config error: set `LLM_API_KEY` (or `OPENAI_API_KEY`) on backend.
- upload URL works locally but not in production: set `PUBLIC_IMAGE_BASE_URL` and `PUBLIC_AUDIO_BASE_URL` to your public backend domain.
