import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// IndexedDB-backed offline outbox + cached GETs for the field PWA.
// Two stores:
//  - outbox: queued mutations (task status updates + photo uploads). Each
//    item has a `kind` discriminator; the drainer dispatches by kind.
//  - cache: small key/value blob of last-fetched lists (tasks, trees,
//    groves) so the shell can render meaningful content while offline.
// Photos store the raw File as a Blob so the user can submit a capture,
// close the tab, and the upload still resumes when connectivity returns.

export type OutboxItem =
  | {
      id: string;
      kind: "task-status";
      createdAt: number;
      retryCount: number;
      lastError?: string;
      taskId: number;
      status: "in_progress" | "completed";
    }
  | {
      id: string;
      kind: "photo-upload";
      createdAt: number;
      retryCount: number;
      lastError?: string;
      /**
       * "in_flight" rows are owned by an active inline upload attempt
       * and are skipped by the drainer until they age past
       * IN_FLIGHT_TIMEOUT_MS (so a tab-closed mid-upload eventually
       * gets retried). "queued" rows are eligible for immediate drain.
       */
      stage?: "in_flight" | "queued";
      stageStartedAt?: number;
      blob: Blob;
      originalFileName: string;
      contentType: string;
      fileSizeBytes: number;
      purpose: string;
      treeId: number | null;
      groveId: number | null;
      zone: string | null;
      photoSide: string | null;
      reportType: string | null;
      caption: string | null;
      linkedEntityType: string | null;
      linkedEntityId: number | null;
    };

/**
 * After this many ms an "in_flight" row is treated as abandoned
 * (tab closed mid-PUT) and the drainer reclaims it.
 */
export const IN_FLIGHT_TIMEOUT_MS = 5 * 60_000;

interface FieldOfflineDB extends DBSchema {
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: { byCreatedAt: number };
  };
  cache: {
    key: string;
    value: { key: string; updatedAt: number; payload: unknown };
  };
}

const DB_NAME = "khalaf-field-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FieldOfflineDB>> | null = null;

function getDB(): Promise<IDBPDatabase<FieldOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) {
          const s = db.createObjectStore("outbox", { keyPath: "id" });
          s.createIndex("byCreatedAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Discriminated-union helper — we strip the auto-managed fields from
// each member individually so TS keeps the `kind` discriminator.
type WithoutMeta<T> = Omit<T, "id" | "createdAt" | "retryCount">;
export type OutboxInput =
  | WithoutMeta<Extract<OutboxItem, { kind: "task-status" }>>
  | WithoutMeta<Extract<OutboxItem, { kind: "photo-upload" }>>;

export async function enqueue(item: OutboxInput): Promise<OutboxItem> {
  const db = await getDB();
  const full = {
    ...item,
    id: makeId(item.kind),
    createdAt: Date.now(),
    retryCount: 0,
  } as OutboxItem;
  await db.put("outbox", full);
  notifyChange();
  return full;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDB();
  return db.getAllFromIndex("outbox", "byCreatedAt");
}

export async function deleteOutboxItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("outbox", id);
  notifyChange();
}

export async function updateOutboxItem(item: OutboxItem): Promise<void> {
  const db = await getDB();
  await db.put("outbox", item);
  notifyChange();
}

export async function cachePut(key: string, payload: unknown): Promise<void> {
  const db = await getDB();
  await db.put("cache", { key, updatedAt: Date.now(), payload });
}

export async function cacheGet<T = unknown>(
  key: string,
): Promise<{ payload: T; updatedAt: number } | null> {
  const db = await getDB();
  const v = await db.get("cache", key);
  if (!v) return null;
  return { payload: v.payload as T, updatedAt: v.updatedAt };
}

// Lightweight pub/sub so the layout indicator + any retry button can
// re-render when the queue changes. Kept dependency-free on purpose.
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange() {
  for (const l of listeners) {
    try {
      l();
    } catch {}
  }
}
export { notifyChange as _notifyChangeForDrainer };
