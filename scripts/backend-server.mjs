import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 8787;
const DEFAULT_DB = "germanapp";
const DEFAULT_IMAGE_DIR = "./uploads";
const DEFAULT_REQUEST_BODY_LIMIT = "10mb";
const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-1-mini";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";

const loadDotEnv = async () => {
  const envPath = path.resolve(process.cwd(), ".env");
  try {
    const contents = await readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, equalsIndex).trim();
      if (!key || process.env[key]) {
        continue;
      }
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to load .env file:", error);
    }
  }
};

await loadDotEnv();

const {
  PORT = DEFAULT_PORT,
  MONGODB_URI = "",
  MONGODB_DB = DEFAULT_DB,
  WORD_SYNC_TOKEN = "",
  LLM_PROXY_TOKEN = "",
  IMAGE_UPLOAD_TOKEN = "",
  AUDIO_UPLOAD_TOKEN = "",
  LLM_API_KEY = "",
  OPENAI_API_KEY = "",
  OPENAI_API_BASE_URL = DEFAULT_OPENAI_API_BASE_URL,
  OPENAI_CHAT_MODEL = DEFAULT_CHAT_MODEL,
  OPENAI_IMAGE_MODEL = DEFAULT_IMAGE_MODEL,
  OPENAI_IMAGE_QUALITY = DEFAULT_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE = DEFAULT_IMAGE_SIZE,
  OPENAI_TTS_MODEL = DEFAULT_TTS_MODEL,
  OPENAI_TTS_VOICE = DEFAULT_TTS_VOICE,
  IMAGE_STORAGE_PATH = DEFAULT_IMAGE_DIR,
  PUBLIC_IMAGE_BASE_URL = "",
  PUBLIC_AUDIO_BASE_URL = "",
  CORS_ORIGIN = "*",
  REQUEST_BODY_LIMIT = DEFAULT_REQUEST_BODY_LIMIT,
} = process.env;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is required to start the backend server. Set it in your shell or a .env file (e.g. MONGODB_URI=mongodb://localhost:27017/germanapp).",
  );
}

const app = express();
const corsOriginList = String(CORS_ORIGIN)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin =
  corsOriginList.length === 0 || corsOriginList.includes("*") ? true : corsOriginList;
app.set("trust proxy", 1);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

const uploadDir = path.resolve(process.cwd(), IMAGE_STORAGE_PATH);
await mkdir(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
const wordEntries = db.collection("wordEntries");
const wordEntryDeletions = db.collection("wordEntryDeletions");
const imageAssets = db.collection("imageAssets");
const audioAssets = db.collection("audioAssets");
const llmApiKey = LLM_API_KEY || OPENAI_API_KEY;
const openAiBaseUrl = String(OPENAI_API_BASE_URL || DEFAULT_OPENAI_API_BASE_URL).replace(/\/$/, "");

const isAuthorized = (req, expectedToken) => {
  if (!expectedToken) {
    return true;
  }
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${expectedToken}`;
};

const requireToken = (expectedToken) => (req, res, next) => {
  if (isAuthorized(req, expectedToken)) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    endpoints: {
      health: "/health",
      words: "/api/words",
      sync: "/api/words/sync",
      images: "/api/images",
      audio: "/api/audio",
      llmCard: "/api/llm/card",
      llmImage: "/api/llm/image",
      llmVoice: "/api/llm/voice",
      uploads: "/uploads/<filename>",
    },
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/words", requireToken(WORD_SYNC_TOKEN), async (_req, res) => {
  const entries = await wordEntries.find({}).toArray();
  res.json(entries.map(({ _id, ...rest }) => ({ id: _id, ...rest })));
});

app.put("/api/words", requireToken(WORD_SYNC_TOKEN), async (req, res) => {
  const entries = Array.isArray(req.body) ? req.body : null;
  if (!entries) {
    res.status(400).json({ error: "Payload must be an array of word entries." });
    return;
  }

  const now = new Date().toISOString();
  const bulk = entries.map((entry) => ({
    updateOne: {
      filter: { _id: entry.id },
      update: {
        $set: {
          ...entry,
          _id: entry.id,
          updatedAt: entry.updatedAt ?? now,
          clientId: entry.clientId ?? "import",
        },
      },
      upsert: true,
    },
  }));

  if (bulk.length > 0) {
    await wordEntries.bulkWrite(bulk);
    await wordEntryDeletions.deleteMany({ _id: { $in: entries.map((entry) => entry.id) } });
  }
  res.status(204).send();
});

const compareTimestamp = (left, right) => {
  const leftDate = left ? Date.parse(left) : 0;
  const rightDate = right ? Date.parse(right) : 0;
  return leftDate - rightDate;
};

const normalizeEntry = (entry, clientId) => {
  const now = new Date().toISOString();
  return {
    ...entry,
    updatedAt: entry.updatedAt ?? now,
    clientId: entry.clientId ?? clientId,
  };
};

app.post("/api/words/sync", requireToken(WORD_SYNC_TOKEN), async (req, res) => {
  const { clientId = "unknown", since = null, entries = [], deletedIds = [] } = req.body ?? {};
  if (!Array.isArray(entries) || !Array.isArray(deletedIds)) {
    res.status(400).json({ error: "Payload must include entries and deletedIds arrays." });
    return;
  }

  const conflicts = [];
  for (const entry of entries) {
    if (!entry?.id) {
      continue;
    }
    const normalized = normalizeEntry(entry, clientId);
    const existing = await wordEntries.findOne({ _id: entry.id });
    if (existing) {
      const existingEntry = { id: existing._id, ...existing };
      const existingUpdatedAt = existing.updatedAt;
      const isConcurrent =
        since &&
        compareTimestamp(existingUpdatedAt, since) > 0 &&
        compareTimestamp(normalized.updatedAt, since) > 0 &&
        normalized.updatedAt !== existingUpdatedAt;
      if (isConcurrent) {
        conflicts.push({ id: entry.id, type: "update", local: normalized, remote: existingEntry });
        continue;
      }
      if (compareTimestamp(normalized.updatedAt, existingUpdatedAt) <= 0) {
        continue;
      }
    }

    await wordEntries.updateOne(
      { _id: entry.id },
      {
        $set: {
          ...normalized,
          _id: entry.id,
        },
      },
      { upsert: true },
    );
    await wordEntryDeletions.deleteOne({ _id: entry.id });
  }

  for (const id of deletedIds) {
    if (!id) {
      continue;
    }
    const existing = await wordEntries.findOne({ _id: id });
    if (!existing) {
      continue;
    }
    if (since && compareTimestamp(existing.updatedAt, since) > 0) {
      conflicts.push({ id, type: "delete", local: null, remote: { id: existing._id, ...existing } });
      continue;
    }
    await wordEntries.deleteOne({ _id: id });
    await wordEntryDeletions.updateOne(
      { _id: id },
      { $set: { deletedAt: new Date().toISOString() } },
      { upsert: true },
    );
  }

  const entryQuery = since ? { updatedAt: { $gt: since } } : {};
  const entriesResult = await wordEntries.find(entryQuery).toArray();
  const deletedQuery = since ? { deletedAt: { $gt: since } } : {};
  const deletionsResult = since ? await wordEntryDeletions.find(deletedQuery).toArray() : [];

  res.json({
    entries: entriesResult.map(({ _id, ...rest }) => ({ id: _id, ...rest })),
    deletedIds: deletionsResult.map(({ _id }) => _id),
    serverTime: new Date().toISOString(),
    conflicts,
  });
});

const toSafeSlug = (value) =>
  String(value ?? "image")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

const MEDIA_EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

const parseDataUrl = (dataUrl, mediaPrefix) => {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith(`data:${mediaPrefix}/`)) {
    return null;
  }

  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }

  const metadata = dataUrl.slice(5, commaIndex);
  const [mime, encoding] = metadata.split(";");
  if (!mime || !mime.startsWith(`${mediaPrefix}/`) || encoding !== "base64") {
    return null;
  }

  const base64 = dataUrl.slice(commaIndex + 1);
  if (!base64) {
    return null;
  }

  const fallbackExt = (mime.split("/")[1] ?? mediaPrefix).replace(/[^a-z0-9]/gi, "") || mediaPrefix;
  const ext = MEDIA_EXTENSION_BY_MIME[mime.toLowerCase()] ?? fallbackExt.toLowerCase();

  return { mime: mime.toLowerCase(), base64, ext };
};

const resolvePublicAssetBaseUrl = (req, configuredBaseUrl) =>
  configuredBaseUrl || `${req.protocol}://${req.get("host") ?? `localhost:${PORT}`}/uploads`;

const toSafeAssetExt = (mime, fallbackExt) => {
  const normalizedMime = String(mime || "").toLowerCase();
  const mapped = MEDIA_EXTENSION_BY_MIME[normalizedMime];
  if (mapped) {
    return mapped;
  }
  return String(fallbackExt || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "bin";
};

const saveAssetBuffer = async ({
  req,
  buffer,
  german,
  model,
  mime,
  defaultWord,
  configuredBaseUrl,
  collection,
  fallbackExt,
}) => {
  const ext = toSafeAssetExt(mime, fallbackExt);
  const fileName = `${toSafeSlug(german || defaultWord)}-${Date.now()}-${toSafeSlug(model)}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  await writeFile(filePath, buffer);

  const baseUrl = resolvePublicAssetBaseUrl(req, configuredBaseUrl);
  const url = `${baseUrl}/${fileName}`;

  await collection.insertOne({
    word: german,
    model,
    url,
    mime,
    createdAt: new Date().toISOString(),
  });

  return { url, status: 200 };
};

const saveUploadedAsset = async ({
  req,
  dataUrl,
  german,
  model,
  mediaPrefix,
  defaultWord,
  configuredBaseUrl,
  collection,
}) => {
  const parsedDataUrl = parseDataUrl(dataUrl, mediaPrefix);
  if (!parsedDataUrl) {
    return { error: "Invalid dataUrl format.", status: 400 };
  }

  const fileName = `${toSafeSlug(german || defaultWord)}-${Date.now()}-${toSafeSlug(model)}.${parsedDataUrl.ext}`;
  const filePath = path.join(uploadDir, fileName);

  await writeFile(filePath, Buffer.from(parsedDataUrl.base64, "base64"));

  const baseUrl = resolvePublicAssetBaseUrl(req, configuredBaseUrl);
  const url = `${baseUrl}/${fileName}`;

  await collection.insertOne({
    word: german,
    model,
    url,
    mime: parsedDataUrl.mime,
    createdAt: new Date().toISOString(),
  });

  return { url, status: 200 };
};

const formatUpstreamError = async (response) => {
  const statusLabel = `${response.status} ${response.statusText}`.trim();
  try {
    const text = await response.text();
    if (!text) {
      return statusLabel;
    }
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message ?? parsed?.message;
      if (message) {
        return `${statusLabel} - ${message}`;
      }
    } catch {
      return `${statusLabel} - ${text}`;
    }
    return `${statusLabel} - ${text}`;
  } catch {
    return statusLabel;
  }
};

const ensureLlmConfigured = (res) => {
  if (llmApiKey) {
    return true;
  }
  res.status(503).json({
    error: "LLM API key is not configured on the backend. Set LLM_API_KEY or OPENAI_API_KEY.",
  });
  return false;
};

const buildOpenAiHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${llmApiKey}`,
});

const sanitizeText = (value) => (typeof value === "string" ? value.trim() : "");

const sanitizePartOfSpeech = (value) => {
  if (value === "noun" || value === "verb" || value === "adj" || value === "other") {
    return value;
  }
  return "other";
};

const sanitizeArticle = (value) => {
  if (value === "der" || value === "die" || value === "das") {
    return value;
  }
  return null;
};

const normalizeCardDraft = (draft) => {
  const partOfSpeech = sanitizePartOfSpeech(draft?.partOfSpeech);
  const article = partOfSpeech === "noun" ? sanitizeArticle(draft?.article) : null;
  const sense = sanitizeText(draft?.sense);
  const notes = sanitizeText(draft?.notes);

  return {
    german: sanitizeText(draft?.german),
    english: sanitizeText(draft?.english),
    sense,
    partOfSpeech,
    article,
    exampleDe: sanitizeText(draft?.exampleDe),
    exampleEn: sanitizeText(draft?.exampleEn),
    notes,
  };
};

const buildCardPrompt = (inputLanguage, userText) => {
  const system =
    "You generate vocabulary flashcard data for German learners. Output must be valid JSON only. Follow schema strictly. Prefer common everyday meanings.";

  const user = [
    `Input: ${userText}`,
    `Input language: ${inputLanguage}`,
    "Return JSON in the following shape:",
    `{"german":"","english":"","sense":"","partOfSpeech":"noun|verb|adj|other","article":"der|die|das|null","exampleDe":"","exampleEn":"","notes":""}`,
    "Rules:",
    "- If inputLanguage is 'de': treat input as German, translate to English.",
    "- If inputLanguage is 'en': produce most common German translation.",
    "- If multiple meanings exist, include a short 'sense' to disambiguate (1-3 words). Otherwise leave it empty.",
    "- Infer partOfSpeech; if not noun, article must be null.",
    "- Keep example sentence short, A2-B1.",
    "- Avoid sensitive/personal content.",
    "- Output JSON only, no markdown.",
  ].join("\n");

  return { system, user };
};

const requireLlmToken = requireToken(LLM_PROXY_TOKEN || WORD_SYNC_TOKEN);

app.post("/api/llm/card", requireLlmToken, async (req, res) => {
  if (!ensureLlmConfigured(res)) {
    return;
  }

  const { inputLanguage, userText, model = OPENAI_CHAT_MODEL } = req.body ?? {};
  if (inputLanguage !== "de" && inputLanguage !== "en") {
    res.status(400).json({ error: "inputLanguage must be 'de' or 'en'." });
    return;
  }
  if (!sanitizeText(userText)) {
    res.status(400).json({ error: "userText is required." });
    return;
  }

  const { system, user } = buildCardPrompt(inputLanguage, userText);
  const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: buildOpenAiHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const details = await formatUpstreamError(response);
    res.status(502).json({ error: `Card generation failed (${details}).` });
    return;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    res.status(502).json({ error: "Card generation response missing content." });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    res.status(502).json({ error: "Card generation returned invalid JSON." });
    return;
  }

  const draft = normalizeCardDraft(parsed);
  if (!draft.german || !draft.english || !draft.exampleDe || !draft.exampleEn) {
    res.status(502).json({ error: "Card generation returned incomplete data." });
    return;
  }

  res.json({
    draft,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
    llmRawJson: content,
  });
});

app.post("/api/llm/image", requireLlmToken, async (req, res) => {
  if (!ensureLlmConfigured(res)) {
    return;
  }

  const {
    german,
    model = OPENAI_IMAGE_MODEL,
    quality = OPENAI_IMAGE_QUALITY,
    size = OPENAI_IMAGE_SIZE,
  } = req.body ?? {};

  if (!sanitizeText(german)) {
    res.status(400).json({ error: "german is required." });
    return;
  }

  const prompt = `Create a clean, friendly illustration that represents the German word or phrase: "${german}". Avoid text, logos, or watermarks.`;
  const requestImage = async (requestPayload) =>
    fetch(`${openAiBaseUrl}/images/generations`, {
      method: "POST",
      headers: buildOpenAiHeaders(),
      body: JSON.stringify(requestPayload),
    });

  const basePayload = { model, prompt, quality, size };
  let response = await requestImage({ ...basePayload, response_format: "b64_json" });
  if (!response.ok) {
    const details = await formatUpstreamError(response);
    const shouldRetry = details.toLowerCase().includes("unknown parameter") && details.includes("response_format");
    if (shouldRetry) {
      response = await requestImage(basePayload);
    } else {
      res.status(502).json({ error: `Image generation failed (${details}).` });
      return;
    }
  }

  if (!response.ok) {
    const details = await formatUpstreamError(response);
    res.status(502).json({ error: `Image generation failed (${details}).` });
    return;
  }

  const payload = await response.json();
  const data = payload?.data?.[0];
  if (!data) {
    res.status(502).json({ error: "Image generation response missing data." });
    return;
  }

  let buffer;
  let mime = "image/png";
  if (typeof data.b64_json === "string" && data.b64_json) {
    buffer = Buffer.from(data.b64_json, "base64");
  } else if (typeof data.url === "string" && data.url) {
    const imageResponse = await fetch(data.url);
    if (!imageResponse.ok) {
      const details = await formatUpstreamError(imageResponse);
      res.status(502).json({ error: `Image download failed (${details}).` });
      return;
    }
    buffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type");
    if (contentType) {
      mime = contentType.split(";")[0];
    }
  } else {
    res.status(502).json({ error: "Image generation response missing image content." });
    return;
  }

  const saved = await saveAssetBuffer({
    req,
    buffer,
    german,
    model,
    mime,
    defaultWord: "image",
    configuredBaseUrl: PUBLIC_IMAGE_BASE_URL,
    collection: imageAssets,
    fallbackExt: "png",
  });

  res.json({
    imageUrl: saved.url,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
    llmRawJson: JSON.stringify(payload),
  });
});

app.post("/api/llm/voice", requireLlmToken, async (req, res) => {
  if (!ensureLlmConfigured(res)) {
    return;
  }

  const { german, model = OPENAI_TTS_MODEL, voice = OPENAI_TTS_VOICE } = req.body ?? {};
  if (!sanitizeText(german)) {
    res.status(400).json({ error: "german is required." });
    return;
  }

  const response = await fetch(`${openAiBaseUrl}/audio/speech`, {
    method: "POST",
    headers: buildOpenAiHeaders(),
    body: JSON.stringify({
      model,
      input: german,
      voice,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const details = await formatUpstreamError(response);
    res.status(502).json({ error: `Audio generation failed (${details}).` });
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const saved = await saveAssetBuffer({
    req,
    buffer,
    german,
    model,
    mime: "audio/mpeg",
    defaultWord: "audio",
    configuredBaseUrl: PUBLIC_AUDIO_BASE_URL || PUBLIC_IMAGE_BASE_URL,
    collection: audioAssets,
    fallbackExt: "mp3",
  });

  res.json({
    audioUrl: saved.url,
    llmModel: model,
    llmGeneratedAt: new Date().toISOString(),
  });
});

app.post("/api/images", requireToken(IMAGE_UPLOAD_TOKEN), async (req, res) => {
  const { dataUrl, german = "word", model = "unknown" } = req.body ?? {};

  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "Missing dataUrl." });
    return;
  }

  const result = await saveUploadedAsset({
    req,
    dataUrl,
    german,
    model,
    mediaPrefix: "image",
    defaultWord: "image",
    configuredBaseUrl: PUBLIC_IMAGE_BASE_URL,
    collection: imageAssets,
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ url: result.url });
});

app.post("/api/audio", requireToken(AUDIO_UPLOAD_TOKEN || IMAGE_UPLOAD_TOKEN), async (req, res) => {
  const { dataUrl, german = "word", model = "unknown" } = req.body ?? {};

  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "Missing dataUrl." });
    return;
  }

  const result = await saveUploadedAsset({
    req,
    dataUrl,
    german,
    model,
    mediaPrefix: "audio",
    defaultWord: "audio",
    configuredBaseUrl: PUBLIC_AUDIO_BASE_URL || PUBLIC_IMAGE_BASE_URL,
    collection: audioAssets,
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ url: result.url });
});

app.listen(Number(PORT), () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
