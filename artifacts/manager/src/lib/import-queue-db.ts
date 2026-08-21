import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Persistent IndexedDB queue for the manager Import Center. Each row
// holds the raw File blob plus the metadata needed to finalize the
// upload, so a manager can close the tab mid-import and resume the
// same batch on re-open. The store is intentionally simple — no
// presigned-URL caching — because S3 / object-storage signatures
// expire and the resume path re-issues a fresh URL anyway.

export type ImportQueueStatus = "queued" | "uploading" | "done" | "failed";

export interface ImportQueueRow {
  id: string;
  batchId: number;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  blob: Blob;
  status: ImportQueueStatus;
  retryCount: number;
  error?: string;
  mediaId?: number;
  // Per-batch defaults captured at enqueue time so the resumed import
  // applies the same purpose / grove / tree hints the original session
  // chose, even if the form has been re-edited since.
  purpose: string;
  groveId: number | null;
  treeId: number | null;
  createdAt: number;
}

interface ManagerImportDB extends DBSchema {
  queue: {
    key: string;
    value: ImportQueueRow;
    indexes: { byBatch: number };
  };
  // Lightweight per-batch context so we can list "in-flight" batches
  // even when no rows are queued anymore (e.g. all done, awaiting
  // export click).
  batches: {
    key: number; // batchId
    value: { batchId: number; name: string; touchedAt: number };
  };
}

const DB_NAME = "khalaf-manager-import";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ManagerImportDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ManagerImportDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ManagerImportDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("queue")) {
          const s = db.createObjectStore("queue", { keyPath: "id" });
          s.createIndex("byBatch", "batchId");
        }
        if (!db.objectStoreNames.contains("batches")) {
          db.createObjectStore("batches", { keyPath: "batchId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function rememberBatch(batchId: number, name: string) {
  const db = await getDB();
  await db.put("batches", { batchId, name, touchedAt: Date.now() });
}

export async function listRememberedBatches() {
  const db = await getDB();
  const all = await db.getAll("batches");
  return all.sort((a, b) => b.touchedAt - a.touchedAt);
}

export async function forgetBatch(batchId: number) {
  const db = await getDB();
  const tx = db.transaction(["queue", "batches"], "readwrite");
  await tx.objectStore("batches").delete(batchId);
  const queueRows = await tx.objectStore("queue").index("byBatch").getAllKeys(batchId);
  for (const key of queueRows) {
    await tx.objectStore("queue").delete(key);
  }
  await tx.done;
}

export async function enqueueRow(row: Omit<ImportQueueRow, "createdAt">) {
  const db = await getDB();
  // If a row with this id is already persisted (e.g. from a prior tab
  // that staged it before crashing), preserve its captured per-row
  // metadata + status + retry count + createdAt rather than clobbering
  // them with the caller's current values. This protects resumed rows
  // from being relabeled by a fresh startImport() call.
  const existing = await db.get("queue", row.id);
  const full: ImportQueueRow = existing
    ? {
        ...row,
        // The blob/file content always comes from the live row in
        // memory (it can't survive serialization differences), but
        // identity-carrying fields stay pinned to the original.
        status: existing.status,
        retryCount: existing.retryCount,
        purpose: existing.purpose,
        groveId: existing.groveId,
        treeId: existing.treeId,
        mediaId: existing.mediaId,
        error: existing.error,
        createdAt: existing.createdAt,
      }
    : { ...row, createdAt: Date.now() };
  await db.put("queue", full);
  return full;
}

export async function listQueueForBatch(batchId: number): Promise<ImportQueueRow[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("queue", "byBatch", batchId);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function updateRow(row: ImportQueueRow) {
  const db = await getDB();
  // Preserve the original createdAt across status transitions so row
  // ordering stays deterministic across retries and resumes. Callers
  // typically pass Date.now(); only honor an existing earlier value.
  const existing = await db.get("queue", row.id);
  const createdAt = existing?.createdAt ?? row.createdAt;
  await db.put("queue", { ...row, createdAt });
}

export async function deleteRow(id: string) {
  const db = await getDB();
  await db.delete("queue", id);
}

export async function clearDoneForBatch(batchId: number) {
  const db = await getDB();
  const rows = await db.getAllFromIndex("queue", "byBatch", batchId);
  const tx = db.transaction("queue", "readwrite");
  for (const r of rows) {
    if (r.status === "done") await tx.store.delete(r.id);
  }
  await tx.done;
}

// Purge every row whose status matches one of the given statuses for a
// batch. Used by the Import Center "Clear queued" button so we don't
// leave stale Blobs sitting in IndexedDB after the manager dismisses
// rows from the UI.
export async function purgeRowsByStatus(
  batchId: number,
  statuses: ImportQueueStatus[],
) {
  const db = await getDB();
  const rows = await db.getAllFromIndex("queue", "byBatch", batchId);
  const tx = db.transaction("queue", "readwrite");
  const set = new Set(statuses);
  for (const r of rows) {
    if (set.has(r.status)) await tx.store.delete(r.id);
  }
  await tx.done;
}

export function makeRowId() {
  return `imp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
