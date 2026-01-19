import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8787;
const DEFAULT_DATA_FILE = "./data/word-entries.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFilePath = path.resolve(
  __dirname,
  process.env.WORD_SYNC_DATA_PATH ?? DEFAULT_DATA_FILE,
);
const authToken = process.env.WORD_SYNC_TOKEN ?? "";
const port = Number(process.env.WORD_SYNC_PORT ?? DEFAULT_PORT);

const ensureDataFile = async () => {
  await mkdir(path.dirname(dataFilePath), { recursive: true });
  try {
    await readFile(dataFilePath, "utf8");
  } catch {
    await writeFile(dataFilePath, "[]", "utf8");
  }
};

const readEntries = async () => {
  const raw = await readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const writeEntries = async (entries) => {
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

await ensureDataFile();

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
      const entries = await readEntries();
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

      await writeEntries(payload);
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
  console.log(`Storing entries at ${dataFilePath}`);
});
