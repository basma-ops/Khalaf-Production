import { useMutation } from "@tanstack/react-query";
import {
  finalizePhotoUpload,
  requestUploadUrl,
  type FinalizeUploadResponse,
  type FinalizeUploadRequestPurpose,
} from "@workspace/api-client-react";

export type UploadInput = {
  file: File | Blob;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  purpose: FinalizeUploadRequestPurpose;
  treeId?: number | null;
  groveId?: number | null;
  zone?: string | null;
  caption?: string | null;
  // NOTE: uploadedByUserId is intentionally NOT in this interface.
  // The server derives the uploader from the session cookie.
  linkedEntityType?: string | null;
  linkedEntityId?: number | null;
  analysisProvider?: "auto" | "local_heuristic" | "external_vision_model" | "manual_only";
  batchId?: number | null;
};

export async function uploadPhoto(input: UploadInput): Promise<FinalizeUploadResponse> {
  const presigned = await requestUploadUrl({
    name: input.originalFileName,
    size: input.fileSizeBytes,
    contentType: input.contentType,
  });
  const putRes = await fetch(presigned.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: input.file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }
  return finalizePhotoUpload({
    objectPath: presigned.objectPath,
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    purpose: input.purpose,
    treeId: input.treeId ?? null,
    groveId: input.groveId ?? null,
    zone: input.zone ?? null,
    caption: input.caption ?? null,
    linkedEntityType: input.linkedEntityType ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
    analysisProvider: input.analysisProvider ?? "auto",
    batchId: input.batchId ?? null,
  });
}

export function useUploadPhoto() {
  return useMutation({
    mutationFn: uploadPhoto,
  });
}
