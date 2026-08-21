import { useMutation } from "@tanstack/react-query";
import {
  finalizePhotoUpload,
  requestUploadUrl,
  type FinalizeUploadResponse,
  type FinalizeUploadRequestPurpose,
  type FinalizeUploadRequestPhotoSide,
  type FinalizeUploadRequestReportType,
} from "@workspace/api-client-react";
import { enqueue, deleteOutboxItem, updateOutboxItem } from "./offline-db";

export type UploadInput = {
  file: File | Blob;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  purpose: FinalizeUploadRequestPurpose;
  treeId?: number | null;
  groveId?: number | null;
  zone?: string | null;
  /** Which face of the tree the photo was taken from (N/E/S/W/canopy/trunk). */
  photoSide?: FinalizeUploadRequestPhotoSide | null;
  /** What kind of report this photo represents (general/phenology/scout/...). */
  reportType?: FinalizeUploadRequestReportType | null;
  caption?: string | null;
  // NOTE: uploadedByUserId is intentionally NOT in this interface.
  // The server derives the uploader from the worker's session cookie
  // (so it cannot be spoofed by a client). See FinalizeUploadRequest.
  linkedEntityType?: string | null;
  linkedEntityId?: number | null;
};

/**
 * Thrown by `uploadPhoto` when the upload was queued to the IndexedDB
 * outbox instead of completed in-line. Callers can catch and surface a
 * "saved offline" toast without treating it like an error.
 */
export class PhotoQueuedOfflineError extends Error {
  readonly queued = true;
  constructor(message = "Photo queued for upload when back online") {
    super(message);
    this.name = "PhotoQueuedOfflineError";
  }
}

function inputToOutboxRow(input: UploadInput, stage: "in_flight" | "queued") {
  const blob = input.file instanceof Blob ? input.file : new Blob([input.file]);
  return {
    kind: "photo-upload" as const,
    stage,
    stageStartedAt: Date.now(),
    blob,
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    purpose: input.purpose as string,
    treeId: input.treeId ?? null,
    groveId: input.groveId ?? null,
    zone: input.zone ?? null,
    photoSide: (input.photoSide ?? null) as string | null,
    reportType: (input.reportType ?? null) as string | null,
    caption: input.caption ?? null,
    linkedEntityType: input.linkedEntityType ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
  };
}

async function queuePhotoOffline(input: UploadInput): Promise<never> {
  // The outbox stores raw Blobs so the file survives a tab close.
  await enqueue(inputToOutboxRow(input, "queued"));
  throw new PhotoQueuedOfflineError();
}

/**
 * True when an error is a transport/network-level failure (fetch
 * TypeError, AbortError, 5xx/0 responses) that should be retried via
 * the offline outbox rather than bubbled to the caller. Catches the
 * weak-signal case the navigator.onLine flag misses on flaky links.
 */
function isTransportFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch network failure
  if (err && typeof err === "object" && "name" in err) {
    const n = (err as { name?: string }).name;
    if (n === "AbortError" || n === "TimeoutError" || n === "NetworkError") return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /network|fetch|failed to fetch|load failed|timeout/i.test(msg);
}

export async function uploadPhoto(input: UploadInput): Promise<FinalizeUploadResponse> {
  // Capture-first: with no signal at all, skip the round-trip and queue.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return queuePhotoOffline(input);
  }
  // Persist BEFORE any network work so a tab close mid-PUT doesn't
  // lose the photo. The drainer skips "in_flight" rows for
  // IN_FLIGHT_TIMEOUT_MS, then reclaims them as if abandoned.
  const staged = (await enqueue(inputToOutboxRow(input, "in_flight"))) as Extract<
    Awaited<ReturnType<typeof enqueue>>,
    { kind: "photo-upload" }
  >;
  // If transport fails, flip the staged row to "queued" so the
  // drainer takes over; on hard error, delete it.
  const handoffToQueue = async () => {
    await updateOutboxItem({
      ...staged,
      stage: "queued",
      stageStartedAt: Date.now(),
    });
  };
  let presigned;
  try {
    presigned = await requestUploadUrl({
      name: input.originalFileName,
      size: input.fileSizeBytes,
      contentType: input.contentType,
    });
  } catch (err) {
    if (isTransportFailure(err)) {
      await handoffToQueue();
      throw new PhotoQueuedOfflineError();
    }
    await deleteOutboxItem(staged.id);
    throw err;
  }
  let putRes: Response;
  try {
    putRes = await fetch(presigned.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      body: input.file,
    });
  } catch (err) {
    if (isTransportFailure(err)) {
      await handoffToQueue();
      throw new PhotoQueuedOfflineError();
    }
    await deleteOutboxItem(staged.id);
    throw err;
  }
  // 5xx and opaque-network 0 are retryable; 4xx is a real error.
  if (putRes.status === 0 || putRes.status >= 500) {
    await handoffToQueue();
    throw new PhotoQueuedOfflineError();
  }
  if (!putRes.ok) {
    await deleteOutboxItem(staged.id);
    throw new Error(`Upload failed (${putRes.status})`);
  }
  try {
    const res = await finalizePhotoUpload({
      objectPath: presigned.objectPath,
      originalFileName: input.originalFileName,
      contentType: input.contentType,
      fileSizeBytes: input.fileSizeBytes,
      purpose: input.purpose,
      treeId: input.treeId ?? null,
      groveId: input.groveId ?? null,
      zone: input.zone ?? null,
      photoSide: input.photoSide ?? null,
      reportType: input.reportType ?? null,
      caption: input.caption ?? null,
      linkedEntityType: input.linkedEntityType ?? null,
      linkedEntityId: input.linkedEntityId ?? null,
      analysisProvider: "auto",
    });
    // Inline upload succeeded — discard the staged row.
    await deleteOutboxItem(staged.id);
    return res;
  } catch (err) {
    if (isTransportFailure(err)) {
      await handoffToQueue();
      throw new PhotoQueuedOfflineError();
    }
    await deleteOutboxItem(staged.id);
    throw err;
  }
}

export function useUploadPhoto() {
  return useMutation({ mutationFn: uploadPhoto });
}
