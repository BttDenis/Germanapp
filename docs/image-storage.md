# Image storage with MongoDB + object storage

This guide describes a recommended production setup that avoids losing illustrations due to browser
storage limits by storing images on a backend and persisting only URLs in the app.

## Recommended architecture

1. **Frontend (this app)**
   - Generates images via the LLM.
   - Uploads the resulting data URL to your backend.
   - Stores the returned URL in the word entry.
   - Uploads audio data URLs from text-to-speech and stores hosted URLs instead of inline data.

2. **Backend API**
   - Accepts image payloads from the app.
   - Saves the image in object storage (S3/R2/GCS).
   - Stores metadata (word, model, timestamps, URL) in MongoDB.
   - Returns the image URL to the client.

3. **Object storage**
   - Stores the image bytes.
   - Serves the images via CDN/public URL.

## Suggested MongoDB schema

```json
{
  "_id": "ObjectId",
  "word": "die Katze",
  "model": "gpt-image-1-mini",
  "url": "https://cdn.example.com/images/katze.png",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

For audio, store similar metadata in a dedicated `audioAssets` collection:

```json
{
  "_id": "ObjectId",
  "word": "die Katze",
  "model": "gpt-4o-mini-tts",
  "url": "https://cdn.example.com/audio/katze.mp3",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

## Backend API contract (minimal)

**POST** `/api/images`

Request:

```json
{
  "dataUrl": "data:image/png;base64,...",
  "german": "die Katze",
  "model": "gpt-image-1-mini"
}
```

Response:

```json
{
  "url": "https://cdn.example.com/images/katze.png"
}
```

The client supports `url`, `imageUrl`, or `location` fields for the returned URL.

**POST** `/api/audio`

Request:

```json
{
  "dataUrl": "data:audio/mpeg;base64,...",
  "german": "die Katze",
  "model": "gpt-4o-mini-tts"
}
```

Response:

```json
{
  "url": "https://cdn.example.com/audio/katze.mp3"
}
```

The client supports `url`, `audioUrl`, or `location` fields for the returned URL.

## Client configuration

Set these in the Vite `.env` file:

```bash
VITE_IMAGE_UPLOAD_URL=https://your-backend.example.com/api/images
VITE_IMAGE_UPLOAD_TOKEN=your-shared-token
VITE_AUDIO_UPLOAD_URL=https://your-backend.example.com/api/audio
VITE_AUDIO_UPLOAD_TOKEN=your-shared-token
```

When configured, the client uploads inline data URLs and saves the hosted URL, preventing localStorage
quota issues from stripping images.

The audio upload configuration performs the same swap for text-to-speech audio.

## Security notes

- Validate bearer tokens on the backend.
- Limit payload sizes (e.g., 1–2 MB).
- Consider scanning images if you accept arbitrary uploads.

## Migration tip

If you already have entries with data URLs, a small migration script can:

1. Read entries from the current sync server or local export.
2. Upload each data URL to the backend (image or audio).
3. Replace `imageUrl`/`audioUrl` with the returned hosted URLs.
