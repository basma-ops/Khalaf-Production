import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { mediaTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { ListMediaQueryParams, CreateMediaBody } from "@workspace/api-zod";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const router: IRouter = Router();

router.get("/media", async (req, res) => {
  const query = ListMediaQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { entityType, entityId } = query.data;
  const conditions: SQL[] = [];
  if (entityType) conditions.push(eq(mediaTable.entityType, entityType));
  if (entityId) conditions.push(eq(mediaTable.entityId, entityId));
  const media = await db.select().from(mediaTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(media);
});

router.post("/media", async (req, res) => {
  const body = CreateMediaBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [media] = await db.insert(mediaTable).values(body.data).returning();
  res.status(201).json(media);
});

// NOTE: the legacy `/media/upload` placeholder route was removed in favor of the
// presigned upload flow under `/storage/uploads/request-url` + `/photo-library/finalize-upload`.
// All workers and the manager test page upload through that flow exclusively.

export default router;
