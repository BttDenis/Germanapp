import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

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
const DEFAULT_MEDIA_BACKUP_TO_MONGO = "true";
const DEFAULT_TTS_INSTRUCTIONS =
  "Speak in clear Standard German (Hochdeutsch). Use German pronunciation only and do not anglicize words.";

const loadDotEnv = async () => {
  const envPath = path.resolve(PROJECT_ROOT, ".env");
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
  OPENAI_TTS_INSTRUCTIONS = DEFAULT_TTS_INSTRUCTIONS,
  MEDIA_BACKUP_TO_MONGO = DEFAULT_MEDIA_BACKUP_TO_MONGO,
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

const uploadDir = path.isAbsolute(IMAGE_STORAGE_PATH)
  ? IMAGE_STORAGE_PATH
  : path.resolve(PROJECT_ROOT, IMAGE_STORAGE_PATH);
await mkdir(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));
app.get("/uploads/:fileName", async (req, res, next) => {
  try {
    const fileName = sanitizeText(req.params.fileName);
    if (!fileName) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }

    const asset = await findAssetByFileName(fileName);
    const buffer = toMongoAssetBuffer(asset?.content);
    if (!asset || !buffer) {
      res.status(404).json({ error: "Asset not found." });
      return;
    }

    const mime = sanitizeText(asset.mime) || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
const wordEntries = db.collection("wordEntries");
const wordEntryDeletions = db.collection("wordEntryDeletions");
const imageAssets = db.collection("imageAssets");
const audioAssets = db.collection("audioAssets");
const llmApiKey = LLM_API_KEY || OPENAI_API_KEY;
const openAiBaseUrl = String(OPENAI_API_BASE_URL || DEFAULT_OPENAI_API_BASE_URL).replace(/\/$/, "");
const shouldBackupMediaToMongo = String(MEDIA_BACKUP_TO_MONGO).toLowerCase() !== "false";

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
      llmGrammar: "/api/llm/grammar",
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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const toMongoAssetBuffer = (value) => {
  if (!value) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === "object" && value?._bsontype === "Binary" && value.buffer) {
    return Buffer.from(value.buffer);
  }
  return null;
};

const findAssetByFileName = async (fileName) => {
  const safeFileName = sanitizeText(fileName);
  if (!safeFileName) {
    return null;
  }
  const escapedName = escapeRegex(safeFileName);
  const byFileName = { fileName: safeFileName };
  const byUrlSuffix = { url: { $regex: new RegExp(`/${escapedName}$`) } };
  const query = { $or: [byFileName, byUrlSuffix] };

  const [imageAsset, audioAsset] = await Promise.all([
    imageAssets.findOne(query, { sort: { createdAt: -1 } }),
    audioAssets.findOne(query, { sort: { createdAt: -1 } }),
  ]);
  return imageAsset ?? audioAsset ?? null;
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
  const canStoreInMongo = shouldBackupMediaToMongo && buffer.length <= 12 * 1024 * 1024;

  await collection.insertOne({
    word: german,
    model,
    fileName,
    url,
    mime,
    sizeBytes: buffer.length,
    storedInMongo: canStoreInMongo,
    ...(canStoreInMongo ? { content: buffer } : {}),
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
  const buffer = Buffer.from(parsedDataUrl.base64, "base64");
  return saveAssetBuffer({
    req,
    buffer,
    german,
    model,
    mime: parsedDataUrl.mime,
    defaultWord,
    configuredBaseUrl,
    collection,
    fallbackExt: parsedDataUrl.ext,
  });
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

const sanitizeVerbAuxiliary = (value) => {
  if (value === "haben" || value === "sein") {
    return value;
  }
  return null;
};

const normalizeCardDraft = (draft) => {
  const partOfSpeech = sanitizePartOfSpeech(draft?.partOfSpeech);
  const article = partOfSpeech === "noun" ? sanitizeArticle(draft?.article) : null;
  const sense = sanitizeText(draft?.sense);
  const notes = sanitizeText(draft?.notes);
  const nounPlural = partOfSpeech === "noun" ? sanitizeText(draft?.nounPlural) : "";
  const nounGenitive = partOfSpeech === "noun" ? sanitizeText(draft?.nounGenitive) : "";
  const verbThirdPerson = partOfSpeech === "verb" ? sanitizeText(draft?.verbThirdPerson) : "";
  const verbPast = partOfSpeech === "verb" ? sanitizeText(draft?.verbPast) : "";
  const verbParticipleIi = partOfSpeech === "verb" ? sanitizeText(draft?.verbParticipleIi) : "";
  const verbAuxiliary = partOfSpeech === "verb" ? sanitizeVerbAuxiliary(draft?.verbAuxiliary) : null;
  const adjectiveComparative =
    partOfSpeech === "adj" ? sanitizeText(draft?.adjectiveComparative) : "";
  const adjectiveSuperlative =
    partOfSpeech === "adj" ? sanitizeText(draft?.adjectiveSuperlative) : "";

  return {
    german: sanitizeText(draft?.german),
    english: sanitizeText(draft?.english),
    sense,
    partOfSpeech,
    article,
    exampleDe: sanitizeText(draft?.exampleDe),
    exampleEn: sanitizeText(draft?.exampleEn),
    notes,
    nounPlural,
    nounGenitive,
    verbThirdPerson,
    verbPast,
    verbParticipleIi,
    verbAuxiliary,
    adjectiveComparative,
    adjectiveSuperlative,
  };
};

const sanitizeStringArray = (value, { max = 20, min = 0 } = {}) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const cleaned = value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, max);
  if (cleaned.length < min) {
    return [];
  }
  return cleaned;
};

const normalizeGrammarTable = (table, index) => {
  const columns = sanitizeStringArray(table?.columns, { max: 8, min: 1 });
  const rawRows = Array.isArray(table?.rows) ? table.rows : [];
  const rows = rawRows
    .slice(0, 20)
    .map((row) => {
      if (!Array.isArray(row)) {
        return [];
      }
      return row.slice(0, Math.max(columns.length, 1)).map((cell) => sanitizeText(cell));
    })
    .filter((row) => row.some(Boolean));

  if (columns.length === 0 && rows.length === 0) {
    return null;
  }

  return {
    title: sanitizeText(table?.title) || `Table ${index + 1}`,
    columns: columns.length > 0 ? columns : ["Item"],
    rows,
  };
};

const normalizeGrammarExercise = (exercise, index) => {
  const sentenceTemplate = sanitizeText(exercise?.sentenceTemplate);
  const acceptedAnswers = sanitizeStringArray(exercise?.acceptedAnswers, { max: 6, min: 1 });
  if (!sentenceTemplate || acceptedAnswers.length === 0) {
    return null;
  }

  return {
    id: sanitizeText(exercise?.id) || `ex-${index + 1}`,
    instruction: sanitizeText(exercise?.instruction) || "Fill in the blank with the correct form.",
    sentenceTemplate,
    baseWord: sanitizeText(exercise?.baseWord) || "word",
    acceptedAnswers,
    explanation: sanitizeText(exercise?.explanation) || "Use the target grammar rule to choose the correct form.",
    topicTag: sanitizeText(exercise?.topicTag) || "general",
  };
};

const normalizeGrammarPack = (payload, topic) => {
  const ruleSummary = sanitizeStringArray(payload?.ruleSummary, { max: 10 });
  const studyTips = sanitizeStringArray(payload?.studyTips, { max: 8 });
  const tables = (Array.isArray(payload?.tables) ? payload.tables : [])
    .slice(0, 6)
    .map((table, index) => normalizeGrammarTable(table, index))
    .filter(Boolean);
  const exercises = (Array.isArray(payload?.exercises) ? payload.exercises : [])
    .slice(0, 20)
    .map((exercise, index) => normalizeGrammarExercise(exercise, index))
    .filter(Boolean);

  return {
    title: sanitizeText(payload?.title) || `Grammar: ${sanitizeText(topic)}`,
    topic: sanitizeText(payload?.topic) || sanitizeText(topic),
    ruleSummary,
    tables,
    exercises,
    studyTips,
  };
};

const buildCardPrompt = (inputLanguage, userText) => {
  const system =
    "You generate vocabulary flashcard data for German learners. Output must be valid JSON only. Follow schema strictly. Prefer common everyday meanings.";

  const user = [
    `Input: ${userText}`,
    `Input language: ${inputLanguage}`,
    "Return JSON in the following shape:",
    `{"german":"","english":"","sense":"","partOfSpeech":"noun|verb|adj|other","article":"der|die|das|null","exampleDe":"","exampleEn":"","notes":"","nounPlural":"","nounGenitive":"","verbThirdPerson":"","verbPast":"","verbParticipleIi":"","verbAuxiliary":"haben|sein|null","adjectiveComparative":"","adjectiveSuperlative":""}`,
    "Rules:",
    "- If inputLanguage is 'de': treat input as German, translate to English.",
    "- If inputLanguage is 'en': produce most common German translation.",
    "- If multiple meanings exist, include a short 'sense' to disambiguate (1-3 words). Otherwise leave it empty.",
    "- Infer partOfSpeech; if not noun, article must be null.",
    "- For nouns: include article and if known include nounPlural and nounGenitive. For non-nouns, noun fields must be empty strings.",
    "- For verbs: include verbThirdPerson (er/sie/es present), verbPast (Prateritum), verbParticipleIi, and verbAuxiliary (haben|sein). For non-verbs, verb fields must be empty strings and verbAuxiliary null.",
    "- For adjectives: include comparative and superlative forms if standard. For non-adjectives, adjective fields must be empty strings.",
    "- Keep example sentence short, A2-B1.",
    "- Avoid sensitive/personal content.",
    "- Output JSON only, no markdown.",
  ].join("\n");

  return { system, user };
};

const buildGrammarPrompt = ({
  topic,
  details,
  level,
  formatHint,
  wordSource = "dictionary",
  dictionaryWords = [],
  freeWords = [],
}) => {
  const normalizedWordSource = wordSource === "free" ? "free" : "dictionary";
  const fallbackWordSource =
    normalizedWordSource === "dictionary" ? "free words (if provided)" : "dictionary words (if provided)";
  const wordSourceContext =
    normalizedWordSource === "dictionary"
      ? "Primary source: dictionary words."
      : "Primary source: free/custom words.";

  const system =
    "You are a German grammar coach. Return valid JSON only. Build compact study packs with clear rules and practical blank-based exercises.";

  const user = [
    `Topic: ${topic}`,
    `Level: ${level || "auto"}`,
    `Learner details: ${details || "none"}`,
    `Formatting preference: ${formatHint || "auto"}`,
    `Word source mode: ${normalizedWordSource}`,
    wordSourceContext,
    `Dictionary words: ${dictionaryWords.length > 0 ? dictionaryWords.join(", ") : "none"}`,
    `Free/custom words: ${freeWords.length > 0 ? freeWords.join(", ") : "none"}`,
    "Return JSON in the exact shape:",
    `{"title":"","topic":"","ruleSummary":[""],"tables":[{"title":"","columns":[""],"rows":[[""]]}],"exercises":[{"id":"","instruction":"","sentenceTemplate":"","baseWord":"","acceptedAnswers":[""],"explanation":"","topicTag":""}],"studyTips":[""]}`,
    "Rules:",
    "- Keep ruleSummary concise and practical (3-8 bullets).",
    "- Include tables only if useful for this topic (cases, pronouns, prefix patterns, endings, etc.).",
    "- Exercises should be mostly fill-in-the-blank transformations using one blank placeholder: ____ .",
    "- Each exercise must include baseWord in lemma form and acceptedAnswers with at least one valid answer.",
    `- Prioritize exercise vocabulary from the selected source mode (${normalizedWordSource}).`,
    `- If the selected source has too few relevant words, fallback to ${fallbackWordSource}.`,
    "- If both lists are empty or unsuitable, use common everyday German vocabulary and note that implicitly in examples.",
    "- Use simple German examples with English-friendly clarity.",
    "- Keep content safe and non-sensitive.",
    "- Output JSON only; no markdown or extra text.",
  ].join("\n");

  return { system, user };
};

const buildImagePrompt = ({
  german,
  english,
  sense,
  partOfSpeech,
  article,
  exampleDe,
  exampleEn,
  notes,
}) => {
  const germanLabel = article ? `${article} ${german}` : german;
  const contextLines = [
    `Target German term: "${germanLabel}".`,
    english ? `English meaning: "${english}".` : "",
    sense ? `Intended sense: "${sense}".` : "",
    partOfSpeech && partOfSpeech !== "other" ? `Part of speech: ${partOfSpeech}.` : "",
    exampleDe ? `German example: "${exampleDe}".` : "",
    exampleEn ? `English example: "${exampleEn}".` : "",
    notes ? `Notes: "${notes}".` : "",
  ].filter(Boolean);

  return [
    "Create one educational flashcard illustration for a German learner.",
    ...contextLines,
    "Depict the intended meaning in a single clear, literal scene with one dominant subject.",
    "Prefer concrete objects/actions over symbolism and avoid mixed interpretations.",
    "Style: clean, friendly digital illustration, visually simple and easy to recognize at small size.",
    "Constraints:",
    "- No text, letters, captions, logos, brands, or watermarks.",
    "- No split panels, no collage, and no multiple unrelated scenes.",
    "- Avoid public figures, copyrighted characters, and sensitive content.",
    "- If the word is ambiguous, use the provided English meaning and sense as the priority.",
  ].join("\n");
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

app.post("/api/llm/grammar", requireLlmToken, async (req, res) => {
  if (!ensureLlmConfigured(res)) {
    return;
  }

  const {
    topic,
    details = "",
    level = "auto",
    formatHint = "",
    wordSource = "dictionary",
    dictionaryWords = [],
    freeWords = [],
    model = OPENAI_CHAT_MODEL,
  } = req.body ?? {};

  const sanitizedTopic = sanitizeText(topic);
  if (!sanitizedTopic) {
    res.status(400).json({ error: "topic is required." });
    return;
  }

  const { system, user } = buildGrammarPrompt({
    topic: sanitizedTopic,
    details: sanitizeText(details),
    level: sanitizeText(level) || "auto",
    formatHint: sanitizeText(formatHint),
    wordSource: sanitizeText(wordSource) === "free" ? "free" : "dictionary",
    dictionaryWords: sanitizeStringArray(dictionaryWords, { max: 50 }),
    freeWords: sanitizeStringArray(freeWords, { max: 50 }),
  });

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
    const detailsMessage = await formatUpstreamError(response);
    res.status(502).json({ error: `Grammar generation failed (${detailsMessage}).` });
    return;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    res.status(502).json({ error: "Grammar generation response missing content." });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    res.status(502).json({ error: "Grammar generation returned invalid JSON." });
    return;
  }

  const pack = normalizeGrammarPack(parsed, sanitizedTopic);
  if (!pack.topic || (pack.ruleSummary.length === 0 && pack.exercises.length === 0)) {
    res.status(502).json({ error: "Grammar generation returned incomplete data." });
    return;
  }

  res.json({
    pack,
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
    english = "",
    sense = "",
    partOfSpeech = "other",
    article = null,
    exampleDe = "",
    exampleEn = "",
    notes = "",
    model = OPENAI_IMAGE_MODEL,
    quality = OPENAI_IMAGE_QUALITY,
    size = OPENAI_IMAGE_SIZE,
  } = req.body ?? {};

  if (!sanitizeText(german)) {
    res.status(400).json({ error: "german is required." });
    return;
  }

  const prompt = buildImagePrompt({
    german: sanitizeText(german),
    english: sanitizeText(english),
    sense: sanitizeText(sense),
    partOfSpeech: sanitizePartOfSpeech(partOfSpeech),
    article: sanitizeArticle(article),
    exampleDe: sanitizeText(exampleDe),
    exampleEn: sanitizeText(exampleEn),
    notes: sanitizeText(notes),
  });
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

  const sanitizedGerman = sanitizeText(german);
  const ttsInstructions = sanitizeText(OPENAI_TTS_INSTRUCTIONS) || DEFAULT_TTS_INSTRUCTIONS;
  const requestVoice = async (requestPayload) =>
    fetch(`${openAiBaseUrl}/audio/speech`, {
      method: "POST",
      headers: buildOpenAiHeaders(),
      body: JSON.stringify(requestPayload),
    });

  const basePayload = {
    model,
    input: sanitizedGerman,
    voice,
    format: "mp3",
  };

  let response = await requestVoice({
    ...basePayload,
    instructions: ttsInstructions,
  });
  if (!response.ok) {
    const details = await formatUpstreamError(response);
    const shouldRetry = details.toLowerCase().includes("unknown parameter") && details.includes("instructions");
    if (shouldRetry) {
      response = await requestVoice(basePayload);
    } else {
      res.status(502).json({ error: `Audio generation failed (${details}).` });
      return;
    }
  }

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
