import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8787;
const DEFAULT_DB = "germanapp";
const DEFAULT_IMAGE_DIR = "./uploads";

const {
  PORT = DEFAULT_PORT,
  MONGODB_URI = "",
  MONGODB_DB = DEFAULT_DB,
  WORD_SYNC_TOKEN = "",
  IMAGE_UPLOAD_TOKEN = "",
  IMAGE_STORAGE_PATH = DEFAULT_IMAGE_DIR,
  PUBLIC_IMAGE_BASE_URL = "",
} = process.env;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is required to start the backend server. Set it in your shell or a .env file (e.g. MONGODB_URI=mongodb://localhost:27017/germanapp).",
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(__dirname, IMAGE_STORAGE_PATH);
await mkdir(imageDir, { recursive: true });
app.use("/uploads", express.static(imageDir));

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
const wordEntries = db.collection("wordEntries");
const wordEntryDeletions = db.collection("wordEntryDeletions");
const imageAssets = db.collection("imageAssets");

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

app.post("/api/images", requireToken(IMAGE_UPLOAD_TOKEN), async (req, res) => {
  const { dataUrl, german = "word", model = "unknown" } = req.body ?? {};

  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    res.status(400).json({ error: "Missing dataUrl." });
    return;
  }

  const matches = dataUrl.match(/^data:(image\/\\w+);base64,(.+)$/);
  if (!matches) {
    res.status(400).json({ error: "Invalid dataUrl format." });
    return;
  }

  const mime = matches[1];
  const base64 = matches[2];
  const ext = mime.split("/")[1] ?? "png";
  const fileName = `${toSafeSlug(german)}-${Date.now()}-${toSafeSlug(model)}.${ext}`;
  const filePath = path.join(imageDir, fileName);

  await writeFile(filePath, Buffer.from(base64, "base64"));

  const baseUrl =
    PUBLIC_IMAGE_BASE_URL ||
    `${req.protocol}://${req.get("host") ?? `localhost:${PORT}`}/uploads`;
  const url = `${baseUrl}/${fileName}`;

  await imageAssets.insertOne({
    word: german,
    model,
    url,
    createdAt: new Date().toISOString(),
  });

  res.json({ url });
});

app.listen(Number(PORT), () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
