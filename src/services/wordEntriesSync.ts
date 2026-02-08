import { WordEntry } from "../types/wordEntry";
import {
  getClientId,
  getWordEntries,
  mergeWordEntries,
  setWordEntries,
} from "../storage/wordEntriesStorage";

const FALLBACK_SYNC_URL = import.meta.env.DEV ? "http://localhost:8787/api/words" : "";
const SYNC_URL = import.meta.env.VITE_WORD_SYNC_URL || FALLBACK_SYNC_URL;
const SYNC_TOKEN = import.meta.env.VITE_WORD_SYNC_TOKEN ?? "";
const resolveSyncEndpoint = (syncUrl: string) => {
  const normalized = syncUrl.replace(/\/$/, "");
  return normalized.endsWith("/sync") ? normalized : `${normalized}/sync`;
};
const SYNC_ENDPOINT = SYNC_URL ? resolveSyncEndpoint(SYNC_URL) : "";
const SYNC_STATE_KEY = "germanapp.wordSyncState";

let pendingSync: number | null = null;

type SyncState = {
  clientId: string;
  lastSyncAt: string | null;
  pendingDeletedIds: string[];
};

export type SyncConflict = {
  id: string;
  type: "update" | "delete";
  local: WordEntry | null;
  remote: WordEntry | null;
};

type SyncResponse = {
  entries: WordEntry[];
  deletedIds: string[];
  serverTime: string;
  conflicts: SyncConflict[];
};

const buildHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SYNC_TOKEN) {
    headers.Authorization = `Bearer ${SYNC_TOKEN}`;
  }

  return headers;
};

const getSyncState = (): SyncState => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { clientId: getClientId(), lastSyncAt: null, pendingDeletedIds: [] };
  }
  const payload = window.localStorage.getItem(SYNC_STATE_KEY);
  if (!payload) {
    return { clientId: getClientId(), lastSyncAt: null, pendingDeletedIds: [] };
  }
  try {
    const parsed = JSON.parse(payload) as SyncState;
    return {
      clientId: parsed.clientId || getClientId(),
      lastSyncAt: parsed.lastSyncAt ?? null,
      pendingDeletedIds: Array.isArray(parsed.pendingDeletedIds) ? parsed.pendingDeletedIds : [],
    };
  } catch {
    return { clientId: getClientId(), lastSyncAt: null, pendingDeletedIds: [] };
  }
};

const setSyncState = (nextState: SyncState) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(nextState));
};

const compareTimestamp = (left?: string | null, right?: string | null) => {
  const leftDate = left ? Date.parse(left) : 0;
  const rightDate = right ? Date.parse(right) : 0;
  return leftDate - rightDate;
};

const ensureLocalMetadata = (entries: WordEntry[], clientId: string) => {
  let changed = false;
  const nextEntries = entries.map((entry) => {
    if (entry.updatedAt && entry.clientId) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
      clientId: entry.clientId ?? clientId,
    };
  });
  if (changed) {
    setWordEntries(nextEntries);
  }
  return nextEntries;
};

const applyRemoteChanges = (
  remoteEntries: WordEntry[],
  deletedIds: string[],
  conflicts: SyncConflict[],
  since: string | null,
) => {
  const existing = getWordEntries();
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  const conflictById = new Map(conflicts.map((conflict) => [conflict.id, conflict]));

  remoteEntries.forEach((entry) => {
    const conflict = conflictById.get(entry.id);
    if (conflict?.type === "update") {
      return;
    }
    const local = existingById.get(entry.id);
    if (!local) {
      existingById.set(entry.id, entry);
      return;
    }
    if (compareTimestamp(entry.updatedAt, local.updatedAt) > 0) {
      existingById.set(entry.id, entry);
    }
  });

  deletedIds.forEach((id) => {
    const conflict = conflictById.get(id);
    if (conflict?.type === "delete") {
      return;
    }
    const entry = existingById.get(id);
    if (!entry) {
      return;
    }
    if (!since || compareTimestamp(entry.updatedAt, since) <= 0) {
      existingById.delete(id);
    }
  });

  setWordEntries(Array.from(existingById.values()));
};

const syncToRemote = async (): Promise<SyncResponse> => {
  const state = getSyncState();
  const localEntries = ensureLocalMetadata(getWordEntries(), state.clientId);
  const since = state.lastSyncAt;
  const entries =
    since === null ? localEntries : localEntries.filter((entry) => compareTimestamp(entry.updatedAt, since) > 0);
  const payload = {
    clientId: state.clientId,
    since,
    entries,
    deletedIds: state.pendingDeletedIds,
  };
  const response = await fetch(SYNC_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Remote sync update failed (${response.status}).`);
  }
  const data = (await response.json()) as SyncResponse;
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
    serverTime: data.serverTime,
    conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
  };
};

export const syncFromRemote = async () => {
  if (!SYNC_ENDPOINT) {
    return {
      added: 0,
      total: getWordEntries().length,
      enabled: false,
      conflicts: [] as SyncConflict[],
      changed: false,
    };
  }
  const beforeEntries = getWordEntries();
  const state = getSyncState();
  const response = await syncToRemote();
  applyRemoteChanges(response.entries, response.deletedIds, response.conflicts, state.lastSyncAt);
  const pendingDeletedIds = state.pendingDeletedIds.filter(
    (id) => !response.deletedIds.includes(id) || response.conflicts.some((conflict) => conflict.id === id),
  );
  setSyncState({
    clientId: state.clientId,
    lastSyncAt: response.serverTime ?? new Date().toISOString(),
    pendingDeletedIds,
  });
  const result = mergeWordEntries([]);
  const afterEntries = getWordEntries();
  const beforeById = new Map(beforeEntries.map((entry) => [entry.id, entry.updatedAt]));
  const changed =
    beforeEntries.length !== afterEntries.length ||
    afterEntries.some((entry) => beforeById.get(entry.id) !== entry.updatedAt);
  return { ...result, enabled: true, conflicts: response.conflicts, changed };
};

export const recordEntryDeletion = (entryId: string) => {
  const state = getSyncState();
  if (state.pendingDeletedIds.includes(entryId)) {
    return;
  }
  setSyncState({ ...state, pendingDeletedIds: [...state.pendingDeletedIds, entryId] });
};

export const scheduleRemoteSync = (onResult?: (result: Awaited<ReturnType<typeof syncFromRemote>>) => void) => {
  if (!SYNC_ENDPOINT) {
    return;
  }
  if (pendingSync) {
    window.clearTimeout(pendingSync);
  }
  pendingSync = window.setTimeout(() => {
    pendingSync = null;
    void syncFromRemote().then((result) => {
      if (onResult) {
        onResult(result);
      }
    });
  }, 1200);
};
