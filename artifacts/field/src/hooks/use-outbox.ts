import { useEffect, useState, useCallback } from "react";
import { listOutbox, subscribe, type OutboxItem } from "@/lib/offline-db";
import { drainOutbox } from "@/lib/offline-drain";

/**
 * Subscribe a component to the on-disk outbox so it can render a live
 * pending count and a "retry now" button. The hook also tracks
 * navigator.onLine so the indicator can switch between "offline" and
 * "syncing" without polling.
 */
export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [draining, setDraining] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listOutbox();
    setItems(next);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      unsub();
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, [refresh]);

  const retry = useCallback(async () => {
    setDraining(true);
    try {
      // Manual taps bypass the MAX_RETRIES gate so a worker can force a
      // re-attempt on items that exceeded auto-retry (e.g. server was
      // down during the auto-loop and is now back).
      await drainOutbox({ force: true });
    } finally {
      setDraining(false);
      refresh();
    }
  }, [refresh]);

  return { items, online, draining, retry };
}
