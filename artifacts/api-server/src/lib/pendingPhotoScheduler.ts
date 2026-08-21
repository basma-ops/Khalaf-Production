import { logger } from "./logger";
import {
  sweepAbandonedPendingPhotos,
  resolvePendingTtlHoursForLogging,
} from "./photoLibrary";

const DEFAULT_INTERVAL_MINUTES = 60;

function resolveIntervalMs(): number {
  const raw = process.env["PENDING_PHOTO_SWEEP_INTERVAL_MINUTES"]?.trim();
  let minutes = DEFAULT_INTERVAL_MINUTES;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) minutes = parsed;
  }
  return Math.round(minutes * 60 * 1000);
}

/**
 * Background sweeper that periodically deletes abandoned "*_pending" photos.
 *
 * Configuration (env vars):
 *   - PENDING_PHOTO_TTL_HOURS         — TTL for the sweep (default 24h)
 *   - PENDING_PHOTO_SWEEP_INTERVAL_MINUTES — how often to run (default 60m)
 *   - PENDING_PHOTO_SWEEP_DISABLED    — set to "1"/"true" to disable entirely
 *
 * The sweep itself logs candidate counts and per-row failures via pino, so
 * this wrapper only logs lifecycle events + unhandled errors. It is
 * intentionally non-fatal: if the sweep throws, we log and keep the
 * interval running so the next tick gets a chance.
 */
export function startPendingPhotoSweeper(): { stop: () => void } | null {
  const disabled = process.env["PENDING_PHOTO_SWEEP_DISABLED"];
  if (disabled === "1" || (disabled ?? "").toLowerCase() === "true") {
    logger.info("Pending photo sweeper disabled via PENDING_PHOTO_SWEEP_DISABLED");
    return null;
  }
  const intervalMs = resolveIntervalMs();
  const log = logger.child({ component: "pendingPhotoSweeper" });

  let running = false;
  const tick = async () => {
    if (running) {
      // Skip overlapping ticks if a previous run is somehow still going
      // (e.g. very large sweep on first boot of a backlogged DB).
      log.warn("Previous sweep still running; skipping this tick");
      return;
    }
    running = true;
    try {
      await sweepAbandonedPendingPhotos({
        triggeredByUserId: null,
        log,
      });
    } catch (err) {
      log.error({ err }, "Pending photo sweep tick failed");
    } finally {
      running = false;
    }
  };

  // Don't run immediately on boot — give the server a few seconds to settle
  // and avoid racing with migrations / first request handling. After that,
  // run on a fixed interval.
  const initialDelayMs = Math.min(intervalMs, 30_000);
  log.info(
    {
      intervalMs,
      initialDelayMs,
      ttlHours: resolvePendingTtlHoursForLogging(),
    },
    "Pending photo sweeper starting",
  );

  const initial = setTimeout(() => void tick(), initialDelayMs);
  const handle = setInterval(() => void tick(), intervalMs);

  // setInterval/setTimeout keep the event loop alive; that's what we want
  // for a server process. No `unref()` here because the API server is
  // long-lived and we don't want this dropped during graceful shutdowns
  // before the rest of the loop drains.

  return {
    stop: () => {
      clearTimeout(initial);
      clearInterval(handle);
    },
  };
}
