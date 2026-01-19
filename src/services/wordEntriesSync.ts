import { WordEntry } from "../types/wordEntry";
import { getWordEntries, mergeWordEntries } from "../storage/wordEntriesStorage";

const SYNC_URL = import.meta.env.VITE_WORD_SYNC_URL ?? "";
const SYNC_TOKEN = import.meta.env.VITE_WORD_SYNC_TOKEN ?? "";

let pendingSync: number | null = null;

const buildHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SYNC_TOKEN) {
    headers.Authorization = `Bearer ${SYNC_TOKEN}`;
  }

  return headers;
};

const parseRemoteEntries = (payload: unknown): WordEntry[] => {
  if (!Array.isArray(payload)) {
    throw new Error("Remote sync payload is not a list of entries.");
  }
  return payload as WordEntry[];
};

const fetchRemoteEntries = async (): Promise<WordEntry[]> => {
  const response = await fetch(SYNC_URL, { method: "GET", headers: buildHeaders() });
  if (!response.ok) {
    throw new Error(`Remote sync fetch failed (${response.status}).`);
  }
  const payload = await response.json();
  return parseRemoteEntries(payload);
};

const pushRemoteEntries = async (entries: WordEntry[]) => {
  const response = await fetch(SYNC_URL, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(entries),
  });
  if (!response.ok) {
    throw new Error(`Remote sync update failed (${response.status}).`);
  }
};

export const syncFromRemote = async () => {
  if (!SYNC_URL) {
    return { added: 0, total: getWordEntries().length, enabled: false };
  }
  const remoteEntries = await fetchRemoteEntries();
  const result = mergeWordEntries(remoteEntries);
  await pushRemoteEntries(getWordEntries());
  return { ...result, enabled: true };
};

export const scheduleRemoteSync = () => {
  if (!SYNC_URL) {
    return;
  }
  if (pendingSync) {
    window.clearTimeout(pendingSync);
  }
  pendingSync = window.setTimeout(() => {
    pendingSync = null;
    void pushRemoteEntries(getWordEntries());
  }, 1200);
};
