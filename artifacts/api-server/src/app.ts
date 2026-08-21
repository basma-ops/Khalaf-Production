import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { backfillBottlingPublicTokens } from "./routes/bottling";

// Best-effort one-shot backfill at boot. Errors are logged, never crash the server.
void backfillBottlingPublicTokens()
  .then((n) => {
    if (n > 0) logger.info({ assigned: n }, "Assigned public tokens to legacy bottling runs");
  })
  .catch((err) => logger.error({ err }, "Failed to backfill bottling public tokens"));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/static", express.static("public"));
app.use("/api", router);

export default app;
