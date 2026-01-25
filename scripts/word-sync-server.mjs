import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const DEFAULT_PORT = 8787;
const DEFAULT_DATA_FILE = "./data/word-entries.json";
const DEFAULT_DB_NAME = "germanapp";
const DEFAULT_COLLECTION = "wordEntries";
const DEFAULT_HISTORY_COLLECTION = "wordEntryHistory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFilePath = path.resolve(
  __dirname,
  process.env.WORD_SYNC_DATA_PATH ?? DEFAULT_DATA_FILE,
);
const authToken = process.env.WORD_SYNC_TOKEN ?? "";
const port = Number(process.env.WORD_SYNC_PORT ?? DEFAULT_PORT);
const mongoUri = process.env.WORD_SYNC_MONGODB_URI ?? process.env.MONGODB_URI ?? "";
const mongoDbName = process.env.WORD_SYNC_DB_NAME ?? DEFAULT_DB_NAME;
const mongoCollectionName = process.env.WORD_SYNC_COLLECTION ?? DEFAULT_COLLECTION;
const mongoHistoryCollectionName =
  process.env.WORD_SYNC_HISTORY_COLLECTION ?? DEFAULT_HISTORY_COLLECTION;

const ensureDataFile = async () => {
  await mkdir(path.dirname(dataFilePath), { recursive: true });
  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeFile(dataFilePath, "[]", "utf8");
  }
};

const createMongoClient = async () => {
  if (!mongoUri) {
    return null;
  }
  const client = new MongoClient(mongoUri);
  await client.connect();
  return client;
};

const readEntries = async (mongo) => {
  if (mongo) {
    const collection = mongo.db(mongoDbName).collection(mongoCollectionName);
    return collection.find({}).project({ _id: 0 }).toArray();
  }
  const raw = await readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const normalizeEntryId = (entry) => {
  if (entry.id) {
    return entry.id;
  }
  const key = `${entry.german ?? ""}|${entry.english ?? ""}|${entry.partOfSpeech ?? ""}`
    .trim()
    .toLowerCase();
  if (!key) {
    return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return `entry-${Buffer.from(key)
    .toString("base64")
    .replace(/=+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;
};

const writeEntries = async (entries, mongo) => {
  if (mongo) {
    const collection = mongo.db(mongoDbName).collection(mongoCollectionName);
    const historyCollection = mongo
      .db(mongoDbName)
      .collection(mongoHistoryCollectionName);
    const now = new Date();
    const batchId = `batch-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const normalized = entries.map((entry) => ({
      ...entry,
      id: normalizeEntryId(entry),
      updatedAt: now.toISOString(),
      createdAt: entry.createdAt ?? now.toISOString(),
    }));
    const operations = normalized.map((entry) => ({
      replaceOne: {
        filter: { id: entry.id },
        replacement: entry,
        upsert: true,
      },
    }));
    if (operations.length > 0) {
      await collection.bulkWrite(operations);
    }
    const ids = normalized.map((entry) => entry.id).filter(Boolean);
    if (ids.length > 0) {
      await collection.deleteMany({ id: { $nin: ids } });
    } else {
      await collection.deleteMany({});
    }
    const historyDocs = normalized.map((entry) => ({
      ...entry,
      batchId,
      receivedAt: now.toISOString(),
    }));
    if (historyDocs.length > 0) {
      await historyCollection.insertMany(historyDocs);
    }
    return;
  }
  await writeFile(dataFilePath, JSON.stringify(entries, null, 2), "utf8");
};

const withCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
};

const isAuthorized = (req) => {
  if (!authToken) {
    return true;
  }
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${authToken}`;
};
const readRequestBody = async (req) =>
  new Promise((resolve, reject) => {
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += chunk;
    });
    req.on("end", () => resolve(buffer));
    req.on("error", reject);
  });

const mongoClient = await createMongoClient();

if (!mongoClient) {
  await ensureDataFile();
}

const server = http.createServer(async (req, res) => {
  try {
    withCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/" && url.pathname !== "/words") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method === "GET") {
      const entries = await readEntries(mongoClient);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entries));
      return;
    }

    if (req.method === "PUT") {
      const body = await readRequestBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload." }));
        return;
      }

      if (!Array.isArray(payload)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload must be an array of word entries." }));
        return;
      }

      await writeEntries(payload, mongoClient);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error", details: String(error) }));
  }
});

server.listen(port, () => {
  console.log(`Word sync server running on http://localhost:${port}`);
  if (mongoClient) {
    console.log(
      `Storing entries in MongoDB (${mongoDbName}.${mongoCollectionName}) with history in ${mongoHistoryCollectionName}`,
    );
  } else {
    console.log(`Storing entries at ${dataFilePath}`);
  }
});
