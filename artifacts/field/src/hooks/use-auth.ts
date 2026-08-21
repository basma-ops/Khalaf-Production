import { useState, useEffect, useCallback } from "react";
import { establishSession, logoutSession } from "@workspace/api-client-react";

const STORAGE_KEY = "khalaf_worker_id";

function getStoredWorkerId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

// Mint the worker's HttpOnly signed session cookie. Errors are surfaced
// later as 401s on subsequent API calls.
async function establishWorkerSession(workerId: number): Promise<void> {
  try {
    await establishSession({ kind: "worker", userId: workerId });
  } catch {
    /* surfaced via subsequent 401s */
  }
}

async function clearServerSession(): Promise<void> {
  try {
    await logoutSession();
  } catch {
    /* best-effort */
  }
}

export function useAuth() {
  const [workerId, setWorkerIdState] = useState<number | null>(getStoredWorkerId);

  // Re-establish the session cookie on first paint (e.g. after a hard
  // refresh) so the API server still recognises this worker.
  useEffect(() => {
    if (workerId != null) void establishWorkerSession(workerId);
  }, [workerId]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const raw = e.newValue;
        const parsed = raw ? parseInt(raw, 10) || null : null;
        setWorkerIdState(parsed);
        if (parsed != null) {
          void establishWorkerSession(parsed);
        } else {
          void clearServerSession();
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setWorkerId = useCallback((id: number | null) => {
    if (id !== null) {
      localStorage.setItem(STORAGE_KEY, id.toString());
      void establishWorkerSession(id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      void clearServerSession();
    }
    setWorkerIdState(id);
  }, []);

  return { workerId, setWorkerId };
}
