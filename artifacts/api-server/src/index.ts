import app from "./app";
import { logger } from "./lib/logger";
import { startPendingPhotoSweeper } from "./lib/pendingPhotoScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Periodic background sweep of abandoned "*_pending" capture-first photos.
  // Safe to start after the listener is up; the sweeper has its own try/catch
  // around each tick so a transient DB / object-storage error never crashes
  // the API process.
  startPendingPhotoSweeper();
});
