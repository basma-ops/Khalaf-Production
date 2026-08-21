import {
  listOutbox,
  deleteOutboxItem,
  updateOutboxItem,
  _notifyChangeForDrainer,
  IN_FLIGHT_TIMEOUT_MS,
  type OutboxItem,
} from "./offline-db";
import {
  finalizePhotoUpload,
  requestUploadUrl,
  updateTask,
  type FinalizeUploadRequestPurpose,
  type FinalizeUploadRequestPhotoSide,
  type FinalizeUploadRequestReportType,
} from "@workspace/api-client-react";

const MAX_RETRIES = 6;

let draining = false;

export async function drainOutbox(opts: { force?: boolean } = {}): Promise<{
  drained: number;
  failed: number;
  skipped: number;
}> {
  if (draining) return { drained: 0, failed: 0, skipped: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { drained: 0, failed: 0, skipped: 0 };
  }
  draining = true;
  let drained = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const items = await listOutbox();
    for (const item of items) {
      // Enforce MAX_RETRIES: items that have hit the cap stay parked
      // in the outbox until the user taps the sync indicator (which
      // calls drainOutbox({ force: true })). This prevents a permanent
      // server-side error from looping every 30s and burning data.
      if (!opts.force && item.retryCount >= MAX_RETRIES) {
        skipped++;
        continue;
      }
      // Skip rows that an inline uploader is currently driving — but
      // reclaim them once IN_FLIGHT_TIMEOUT_MS has elapsed (tab was
      // likely closed mid-PUT, so we own the retry now).
      if (
        item.kind === "photo-upload" &&
        item.stage === "in_flight" &&
        item.stageStartedAt &&
        Date.now() - item.stageStartedAt < IN_FLIGHT_TIMEOUT_MS
      ) {
        skipped++;
        continue;
      }
      try {
        await dispatch(item);
        await deleteOutboxItem(item.id);
        drained++;
      } catch (err) {
        const next: OutboxItem = {
          ...item,
          retryCount: item.retryCount + 1,
          lastError: (err as Error).message,
        };
        await updateOutboxItem(next);
        failed++;
      }
    }
  } finally {
    draining = false;
    _notifyChangeForDrainer();
  }
  return { drained, failed, skipped };
}

async function dispatch(item: OutboxItem): Promise<void> {
  if (item.kind === "task-status") {
    await updateTask(item.taskId, { status: item.status });
    return;
  }
  if (item.kind === "photo-upload") {
    const presigned = await requestUploadUrl({
      name: item.originalFileName,
      size: item.fileSizeBytes,
      contentType: item.contentType,
    });
    const putRes = await fetch(presigned.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": item.contentType },
      body: item.blob,
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed (${putRes.status})`);
    }
    await finalizePhotoUpload({
      objectPath: presigned.objectPath,
      originalFileName: item.originalFileName,
      contentType: item.contentType,
      fileSizeBytes: item.fileSizeBytes,
      purpose: item.purpose as FinalizeUploadRequestPurpose,
      treeId: item.treeId,
      groveId: item.groveId,
      zone: item.zone,
      photoSide: item.photoSide as FinalizeUploadRequestPhotoSide | null,
      reportType: item.reportType as FinalizeUploadRequestReportType | null,
      caption: item.caption,
      linkedEntityType: item.linkedEntityType,
      linkedEntityId: item.linkedEntityId,
      analysisProvider: "auto",
    });
    return;
  }
}

let installed = false;

// Wire the drainer to lifecycle events. Idempotent.
export function installAutoDrain() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // Drain once at boot in case the previous session crashed mid-flight.
  drainOutbox().catch(() => {});
  window.addEventListener("online", () => {
    drainOutbox().catch(() => {});
  });
  // Light periodic poll while the tab is open and online — keeps the
  // outbox warm without depending on background sync (out of scope).
  window.setInterval(() => {
    if (navigator.onLine) drainOutbox().catch(() => {});
  }, 30_000);
}
