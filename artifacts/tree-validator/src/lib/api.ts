/**
 * Thin wrappers around generated client functions for endpoints we
 * call imperatively (not via React Query hooks). The generated client
 * uses absolute `/api/...` paths and includes credentials by default,
 * so we don't need a BASE_URL prefix here — the global reverse proxy
 * routes `/api` to the API server regardless of artifact base path.
 */
import {
  deleteTree as generatedDeleteTree,
  logoutSession as generatedLogoutSession,
} from "@workspace/api-client-react";

export async function deleteTree(id: number): Promise<void> {
  await generatedDeleteTree(id);
}

export async function logout(): Promise<void> {
  try {
    await generatedLogoutSession();
  } catch {
    /* ignore — we still reload to drop client state */
  }
}
