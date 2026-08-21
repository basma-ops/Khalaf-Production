import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { withLabFlags } from "./pressing";
import {
  bottlingRunsTable,
  bottlingRunOilSourcesTable,
  bottleOriginsTable,
  oilBatchesTable,
  pressingRunsTable,
  harvestBatchesTable,
  harvestBatchItemsTable,
  harvestEventsTable,
  harvestBoxesTable,
  harvestSeasonsTable,
  treesTable,
  grovesTable,
  labResultsTable,
  ruleEvidenceTable,
  heritageRulesTable,
  mediaTable,
} from "@workspace/db";
import { eq, inArray, desc, sql, and, or, isNotNull, isNull } from "drizzle-orm";
import {
  CreateBottlingRunBody,
  UpdateBottlingRunBody,
  SetBottlingRunSourcesBody,
} from "@workspace/api-zod";
import { resolvePrincipal, type Principal } from "../lib/auth";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

/** Short, URL-safe opaque slug used for the public /bottle/:token route. */
export function generatePublicToken(): string {
  return randomBytes(8).toString("base64url");
}

/** Single source of truth for the public Bottle Story URL. Used by the QR
 * generator, certificate PDF, and the manager UI link/copy controls so they
 * never drift apart. The base path defaults to the public-site mount
 * (`/welcome`) and can be overridden with `PUBLIC_SITE_BASE_PATH`. The host
 * defaults to the published origin (`PUBLIC_SITE_ORIGIN`) when set, falling
 * back to the inbound request host. */
export function buildPublicBottleUrl(token: string, req?: Request): string {
  const origin =
    (process.env["PUBLIC_SITE_ORIGIN"] ?? "").trim() ||
    (req ? `${req.protocol}://${req.get("host")}` : "");
  const basePath = (process.env["PUBLIC_SITE_BASE_PATH"] ?? "/welcome").replace(/\/+$/, "");
  return `${origin.replace(/\/+$/, "")}${basePath}/bottle/${token}`;
}

/** Best-effort backfill: assigns a public token to every legacy run that
 * predates this column. Called once at server boot from app.ts. */
export async function backfillBottlingPublicTokens(): Promise<number> {
  const rows = await db
    .select({ id: bottlingRunsTable.id })
    .from(bottlingRunsTable)
    .where(isNull(bottlingRunsTable.publicToken));
  for (const r of rows) {
    // Retry a couple of times in the unlikely event of token collision.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await db
          .update(bottlingRunsTable)
          .set({ publicToken: generatePublicToken() })
          .where(eq(bottlingRunsTable.id, r.id));
        break;
      } catch {
        if (attempt === 3) throw new Error(`Failed to assign public token for bottling run ${r.id}`);
      }
    }
  }
  return rows.length;
}

const router: IRouter = Router();

async function requireManager(req: Request, res: Response): Promise<Principal | null> {
  const principal = await resolvePrincipal(req);
  if (!principal) { res.status(401).json({ error: "Authentication required" }); return null; }
  if (principal.kind !== "manager") { res.status(403).json({ error: "Manager role required" }); return null; }
  return principal;
}

type RunRow = typeof bottlingRunsTable.$inferSelect;
type SourceRow = typeof bottlingRunOilSourcesTable.$inferSelect;
type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function annotateSourceCounts(rows: RunRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sources = await db
    .select({ runId: bottlingRunOilSourcesTable.bottlingRunId })
    .from(bottlingRunOilSourcesTable)
    .where(inArray(bottlingRunOilSourcesTable.bottlingRunId, ids));
  const counts = new Map<number, number>();
  for (const s of sources) counts.set(s.runId, (counts.get(s.runId) ?? 0) + 1);
  return rows.map((r) => ({ ...r, sourceCount: counts.get(r.id) ?? 0 }));
}

async function loadOriginsEnriched(runId: number) {
  const origins = await db
    .select()
    .from(bottleOriginsTable)
    .where(eq(bottleOriginsTable.bottlingRunId, runId));
  if (origins.length === 0) return [];
  const treeIds = Array.from(new Set(origins.map((o) => o.treeId)));
  const groveIds = Array.from(
    new Set(origins.map((o) => o.groveId).filter((g): g is number => g != null)),
  );
  const trees = treeIds.length
    ? await db.select().from(treesTable).where(inArray(treesTable.id, treeIds))
    : [];
  const groves = groveIds.length
    ? await db.select().from(grovesTable).where(inArray(grovesTable.id, groveIds))
    : [];
  const treeMap = new Map(trees.map((t) => [t.id, t]));
  const groveMap = new Map(groves.map((g) => [g.id, g]));
  return origins.map((o) => ({
    ...o,
    treeCode: treeMap.get(o.treeId)?.treeCode ?? null,
    groveName: o.groveId != null ? groveMap.get(o.groveId)?.name ?? null : null,
  }));
}

async function loadSourcesEnriched(runId: number) {
  const sources = await db
    .select()
    .from(bottlingRunOilSourcesTable)
    .where(eq(bottlingRunOilSourcesTable.bottlingRunId, runId));
  if (sources.length === 0) return [];
  const batchIds = sources.map((s) => s.oilBatchId);
  const batches = await db.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, batchIds));
  const codeMap = new Map(batches.map((b) => [b.id, b.oilBatchCode]));
  return sources.map((s) => ({ ...s, oilBatchCode: codeMap.get(s.oilBatchId) ?? null }));
}

/**
 * Recompute bottle_origins for a run.
 *
 * Algorithm — for each oil source on the run:
 *   1. Load its oil_batch and the upstream pressing_run + harvest_batch.
 *   2. Build a per-tree olive-weight map for that batch by walking
 *      harvest_batch_items → harvest_events / harvest_boxes.
 *   3. The fraction of the batch's oil that this source draws is
 *      `f = liters_drawn / oil_batch.volume_liters`. Each tree's olive
 *      contribution to this run from this source is therefore
 *      `tree_kg_in_batch[treeId] * f` — measured in actual kilograms of
 *      olives attributable to that tree.
 *   4. We sum kg-contributions across all sources to populate
 *      `bottle_origins.contribution_kg`, then normalize to share %.
 */
async function recomputeOriginsTx(tx: DbLike, runId: number) {
  const sources = await tx
    .select()
    .from(bottlingRunOilSourcesTable)
    .where(eq(bottlingRunOilSourcesTable.bottlingRunId, runId));

  const perTree = new Map<number, { kg: number; groveId: number | null }>();

  for (const src of sources) {
    if (src.litersDrawn <= 0) continue;
    const [batch] = await tx.select().from(oilBatchesTable).where(eq(oilBatchesTable.id, src.oilBatchId));
    if (!batch) continue;
    const batchTotalLiters = batch.volumeLiters ?? 0;
    if (batchTotalLiters <= 0) continue;
    const drawFraction = src.litersDrawn / batchTotalLiters;
    if (drawFraction <= 0) continue;

    const [run] = await tx.select().from(pressingRunsTable).where(eq(pressingRunsTable.id, batch.pressingRunId));
    if (!run) continue;
    const items = await tx
      .select()
      .from(harvestBatchItemsTable)
      .where(eq(harvestBatchItemsTable.harvestBatchId, run.harvestBatchId));
    if (items.length === 0) continue;

    const eventIds = Array.from(new Set(items.map((i) => i.harvestEventId)));
    const boxIds = items.map((i) => i.harvestBoxId).filter((b): b is number => b != null);
    const events = eventIds.length
      ? await tx.select().from(harvestEventsTable).where(inArray(harvestEventsTable.id, eventIds))
      : [];
    const eventMap = new Map(events.map((e) => [e.id, e]));
    const boxes = boxIds.length
      ? await tx.select().from(harvestBoxesTable).where(inArray(harvestBoxesTable.id, boxIds))
      : [];
    const boxMap = new Map(boxes.map((b) => [b.id, b]));

    // Per-tree olive kg in this batch.
    const treeKgInBatch = new Map<number, { kg: number; groveId: number | null }>();
    for (const it of items) {
      const ev = eventMap.get(it.harvestEventId);
      if (!ev) continue;
      let kg = 0;
      if (it.harvestBoxId != null) {
        const bx = boxMap.get(it.harvestBoxId);
        kg = bx?.measuredWeightKg ?? bx?.estimatedWeightKg ?? 0;
      } else {
        kg = ev.totalMeasuredWeightKg ?? ev.totalEstimatedWeightKg ?? 0;
      }
      if (kg <= 0) continue;
      const cur = treeKgInBatch.get(ev.treeId) ?? { kg: 0, groveId: ev.groveId };
      cur.kg += kg;
      treeKgInBatch.set(ev.treeId, cur);
    }

    // Each tree contributes tree_kg * drawFraction kg of olives to this run.
    for (const [treeId, info] of treeKgInBatch.entries()) {
      const contributedKg = info.kg * drawFraction;
      if (contributedKg <= 0) continue;
      const cur = perTree.get(treeId) ?? { kg: 0, groveId: info.groveId };
      cur.kg += contributedKg;
      perTree.set(treeId, cur);
    }
  }

  await tx.delete(bottleOriginsTable).where(eq(bottleOriginsTable.bottlingRunId, runId));

  const total = Array.from(perTree.values()).reduce((s, v) => s + v.kg, 0);
  if (total <= 0 || perTree.size === 0) return;

  const rows = Array.from(perTree.entries()).map(([treeId, info]) => ({
    bottlingRunId: runId,
    treeId,
    groveId: info.groveId,
    contributionKg: info.kg,
    sharePct: (info.kg / total) * 100,
  }));
  await tx.insert(bottleOriginsTable).values(rows);
}

// ── Routes (all manager-gated reads + writes) ────────────────────────────────

router.get("/bottling-runs", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const yearParam = req.query["year"];
  const groveIdParam = req.query["groveId"];
  const year = typeof yearParam === "string" ? Number(yearParam) : undefined;
  const groveId = typeof groveIdParam === "string" ? Number(groveIdParam) : undefined;

  let rows = await db.select().from(bottlingRunsTable).orderBy(desc(bottlingRunsTable.bottledAt));
  if (year && Number.isFinite(year)) {
    rows = rows.filter((r) => (r.bottledAt ?? "").slice(0, 4) === String(year));
  }
  if (groveId && Number.isFinite(groveId)) {
    const inGrove = await db
      .selectDistinct({ runId: bottleOriginsTable.bottlingRunId })
      .from(bottleOriginsTable)
      .where(eq(bottleOriginsTable.groveId, groveId));
    const allowed = new Set(inGrove.map((r) => r.runId));
    rows = rows.filter((r) => allowed.has(r.id));
  }
  res.json(await annotateSourceCounts(rows));
});

router.post("/bottling-runs", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const body = CreateBottlingRunBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  // Always mint a public token. Retry on the (vanishingly unlikely) collision.
  let row: typeof bottlingRunsTable.$inferSelect | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      [row] = await db
        .insert(bottlingRunsTable)
        .values({ ...body.data, publicToken: generatePublicToken() })
        .returning();
      break;
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  res.status(201).json({ ...row!, sourceCount: 0 });
});

router.get("/bottling-runs/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [sources, origins] = await Promise.all([
    loadSourcesEnriched(id),
    loadOriginsEnriched(id),
  ]);
  const publicUrl = row.publicToken ? buildPublicBottleUrl(row.publicToken, req) : null;
  res.json({ ...row, publicUrl, sourceCount: sources.length, sources, origins });
});

router.patch("/bottling-runs/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateBottlingRunBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }
  const [updated] = await db
    .update(bottlingRunsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(bottlingRunsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/bottling-runs/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.transaction(async (tx) => {
    // Lock the run row so a concurrent PUT /sources cannot race a DELETE.
    await tx.execute(sql`SELECT id FROM bottling_runs WHERE id = ${id} FOR UPDATE`);
    // Restore oil volumes via concurrency-safe additive UPDATE per source.
    const sources = await tx
      .select()
      .from(bottlingRunOilSourcesTable)
      .where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
    for (const s of sources) {
      await tx.execute(sql`
        UPDATE oil_batches
        SET volume_remaining_liters = COALESCE(volume_remaining_liters, 0) + ${s.litersDrawn},
            updated_at = NOW()
        WHERE id = ${s.oilBatchId}
      `);
    }
    await tx.delete(bottleOriginsTable).where(eq(bottleOriginsTable.bottlingRunId, id));
    await tx.delete(bottlingRunOilSourcesTable).where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
    await tx.delete(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  });
  res.status(204).end();
});

router.put("/bottling-runs/:id/sources", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = SetBottlingRunSourcesBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body", details: body.error.issues }); return; }

  // Aggregate requested liters per oilBatchId so duplicate rows in the request
  // are combined for validation and persisted as a single row.
  const aggregated = new Map<number, number>();
  for (const s of body.data.sources) {
    if (!Number.isFinite(s.litersDrawn) || s.litersDrawn <= 0) {
      res.status(400).json({ error: `litersDrawn must be > 0 for oil batch ${s.oilBatchId}` });
      return;
    }
    aggregated.set(s.oilBatchId, (aggregated.get(s.oilBatchId) ?? 0) + s.litersDrawn);
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize concurrent edits to the same bottling run by row-locking it
      // before reading prior allocations. Without this, two writers could each
      // see the same priorMap, compute deltas independently, and double-decrement
      // (or over-restore) the same oil batches.
      const lockRows = await tx.execute(sql`SELECT id FROM bottling_runs WHERE id = ${id} FOR UPDATE`);
      const lockArr = (lockRows as { rows?: unknown[] }).rows ?? (lockRows as unknown as unknown[]);
      const ok = Array.isArray(lockArr) ? lockArr.length > 0 : false;
      if (!ok) {
        const err = new Error("Not found") as Error & { httpStatus?: number };
        err.httpStatus = 404;
        throw err;
      }
      const [run] = await tx.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
      if (!run) {
        const err = new Error("Not found") as Error & { httpStatus?: number };
        err.httpStatus = 404;
        throw err;
      }

      // Compute the *net* delta per affected oilBatchId between the new and
      // prior allocations. We then apply each delta with a single conditional
      // UPDATE that takes a row lock and verifies remaining ≥ delta in one
      // statement — this is concurrency-safe under READ COMMITTED because
      // PostgreSQL re-reads the row under the lock before evaluating the
      // WHERE clause for the UPDATE. Two concurrent writers cannot both
      // succeed when only one of them fits the remaining inventory.
      const prior: SourceRow[] = await tx
        .select()
        .from(bottlingRunOilSourcesTable)
        .where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
      const priorMap = new Map<number, number>();
      for (const p of prior) {
        priorMap.set(p.oilBatchId, (priorMap.get(p.oilBatchId) ?? 0) + p.litersDrawn);
      }

      const allBatchIds = Array.from(new Set([
        ...priorMap.keys(),
        ...aggregated.keys(),
      ]));
      const batches = allBatchIds.length
        ? await tx.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, allBatchIds))
        : [];
      const batchMap = new Map(batches.map((b) => [b.id, b]));

      // Validate every requested batch exists.
      for (const oilBatchId of aggregated.keys()) {
        if (!batchMap.has(oilBatchId)) {
          const err = new Error(`Oil batch ${oilBatchId} not found`) as Error & { httpStatus?: number };
          err.httpStatus = 400;
          throw err;
        }
      }

      // Replace sources rows wholesale: delete prior, insert new aggregated.
      await tx.delete(bottlingRunOilSourcesTable).where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
      for (const [oilBatchId, totalLiters] of aggregated.entries()) {
        await tx.insert(bottlingRunOilSourcesTable).values({
          bottlingRunId: id,
          oilBatchId,
          litersDrawn: totalLiters,
        });
      }

      // Apply per-batch delta with a concurrency-safe conditional UPDATE.
      for (const oilBatchId of allBatchIds) {
        const prev = priorMap.get(oilBatchId) ?? 0;
        const next = aggregated.get(oilBatchId) ?? 0;
        const delta = next - prev; // positive = drawing more, negative = restoring
        if (delta === 0) continue;

        if (delta > 0) {
          // Conditional decrement: only succeeds if there is enough remaining.
          const result = await tx.execute(sql`
            UPDATE oil_batches
            SET volume_remaining_liters = COALESCE(volume_remaining_liters, volume_liters, 0) - ${delta},
                updated_at = NOW()
            WHERE id = ${oilBatchId}
              AND COALESCE(volume_remaining_liters, volume_liters, 0) >= ${delta}
            RETURNING id
          `);
          const rows = (result as { rows?: unknown[]; rowCount?: number }).rows
            ?? (result as unknown as unknown[]);
          const ok = Array.isArray(rows) ? rows.length > 0 : ((result as { rowCount?: number }).rowCount ?? 0) > 0;
          if (!ok) {
            const b = batchMap.get(oilBatchId);
            const err = new Error(
              `Oversubscription: oil batch ${b?.oilBatchCode ?? oilBatchId} does not have enough remaining volume for ${delta.toFixed(2)} L`,
            ) as Error & { httpStatus?: number };
            err.httpStatus = 400;
            throw err;
          }
        } else {
          // Restoring volume — always safe.
          await tx.execute(sql`
            UPDATE oil_batches
            SET volume_remaining_liters = COALESCE(volume_remaining_liters, 0) - ${delta},
                updated_at = NOW()
            WHERE id = ${oilBatchId}
          `);
        }
      }

      // Recompute origins inside the same transaction.
      await recomputeOriginsTx(tx, id);

      const [reloaded] = await tx.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
      return reloaded;
    });

    const [sources, origins] = await Promise.all([
      loadSourcesEnriched(id),
      loadOriginsEnriched(id),
    ]);
    res.json({ ...result, sourceCount: sources.length, sources, origins });
  } catch (e) {
    const err = e as Error & { httpStatus?: number };
    res.status(err.httpStatus ?? 500).json({ error: err.message ?? "Internal error" });
  }
});

router.post("/bottling-runs/:id/recompute-origins", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.transaction(async (tx) => {
    // Lock the run row so a concurrent PUT /sources cannot race the recompute
    // and produce duplicate / stale bottle_origins rows.
    await tx.execute(sql`SELECT id FROM bottling_runs WHERE id = ${id} FOR UPDATE`);
    await recomputeOriginsTx(tx, id);
  });
  const [sources, origins] = await Promise.all([
    loadSourcesEnriched(id),
    loadOriginsEnriched(id),
  ]);
  const publicUrl = row.publicToken ? buildPublicBottleUrl(row.publicToken, req) : null;
  res.json({ ...row, publicUrl, sourceCount: sources.length, sources, origins });
});

router.get("/bottling-runs/:id/trees", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  res.json(await loadOriginsEnriched(id));
});

router.get("/trees/:id/bottling-runs", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const treeId = Number(req.params["id"]);
  if (!Number.isFinite(treeId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const origins = await db.select().from(bottleOriginsTable).where(eq(bottleOriginsTable.treeId, treeId));
  if (origins.length === 0) { res.json([]); return; }
  const runIds = Array.from(new Set(origins.map((o) => o.bottlingRunId)));
  const runs = await db.select().from(bottlingRunsTable).where(inArray(bottlingRunsTable.id, runIds));
  const runMap = new Map(runs.map((r) => [r.id, r]));
  const rows = origins
    .map((o) => {
      const run = runMap.get(o.bottlingRunId);
      if (!run) return null;
      const estBottles =
        run.bottlesProduced != null
          ? (run.bottlesProduced * o.sharePct) / 100
          : null;
      return {
        bottlingRunId: run.id,
        runCode: run.runCode,
        bottledAt: run.bottledAt,
        label: run.label,
        lotCode: run.lotCode,
        bottlesProduced: run.bottlesProduced,
        bottleSizeMl: run.bottleSizeMl,
        contributionKg: o.contributionKg,
        sharePct: o.sharePct,
        estimatedBottlesShare: estBottles,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (a.bottledAt < b.bottledAt ? 1 : -1));
  res.json(rows);
});

router.get("/bottling-runs/:id/qr.svg", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [run] = await db.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  let token = run.publicToken;
  if (!token) {
    token = generatePublicToken();
    await db.update(bottlingRunsTable).set({ publicToken: token }).where(eq(bottlingRunsTable.id, id));
  }
  const url = buildPublicBottleUrl(token, req);
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#3D4727", light: "#F2EBDC" },
  });
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(svg);
});

router.get("/bottling-runs/:id/certificate.pdf", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [run] = await db.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  let token = run.publicToken;
  if (!token) {
    token = generatePublicToken();
    await db.update(bottlingRunsTable).set({ publicToken: token }).where(eq(bottlingRunsTable.id, id));
  }
  const url = buildPublicBottleUrl(token, req);

  const origins = await loadOriginsEnriched(id);
  const totalKg = origins.reduce((s, o) => s + o.contributionKg, 0);
  const groves = new Set(origins.map((o) => o.groveName ?? "—"));
  const topTrees = [...origins].sort((a, b) => b.sharePct - a.sharePct).slice(0, 8);

  // Lab results for this run: pinned IDs win, else all results from contributing oil batches.
  const sourceRows = await db
    .select({ oilBatchId: bottlingRunOilSourcesTable.oilBatchId })
    .from(bottlingRunOilSourcesTable)
    .where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
  const oilBatchIds = Array.from(new Set(sourceRows.map((s) => s.oilBatchId)));
  let labRows: Array<typeof labResultsTable.$inferSelect> = [];
  const pinnedIds = run.qualityBasisLabResultIds ?? null;
  if (pinnedIds && pinnedIds.length > 0) {
    labRows = await db.select().from(labResultsTable).where(inArray(labResultsTable.id, pinnedIds));
  } else if (oilBatchIds.length) {
    labRows = await db.select().from(labResultsTable).where(inArray(labResultsTable.oilBatchId, oilBatchIds));
  }
  const labFlagged = labRows.map((l) => ({ row: l, flags: withLabFlags(l) }));

  // PDFKit's SVG renderer requires svg-to-pdfkit; use a PNG buffer instead.
  const qrPng = await QRCode.toBuffer(url, { margin: 1, width: 220, errorCorrectionLevel: "M" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${run.runCode}-certificate.pdf"`);
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  doc.pipe(res);

  doc.fontSize(10).fillColor("#5C6B3D").text("KHALAF OLIVE GROVES — RAMEH, UPPER GALILEE", { characterSpacing: 2 });
  doc.moveDown(0.5);
  doc.fontSize(22).fillColor("#3D4727").text("Bottle Traceability Certificate", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#666").text(
    "This certificate accompanies a single bottling run and lists the trees whose oil it contains. " +
    "Verify by scanning the QR code or visiting the URL below.",
    { width: 360 },
  );

  // Place QR top-right
  doc.image(qrPng, doc.page.width - 48 - 130, 48, { width: 130 });
  doc.fontSize(8).fillColor("#666").text(url, doc.page.width - 48 - 220, 48 + 134, { width: 220, align: "right" });

  doc.moveDown(2);
  doc.fontSize(11).fillColor("#3D4727");
  doc.text(`Run code:    ${run.runCode}`);
  doc.text(`Bottled:     ${run.bottledAt}`);
  if (run.label) doc.text(`Label:       ${run.label}`);
  if (run.lotCode) doc.text(`Lot code:    ${run.lotCode}`);
  if (run.format) doc.text(`Format:      ${run.format}`);
  if (run.bottlesProduced != null) doc.text(`Bottles:     ${run.bottlesProduced}`);
  if (run.totalLitersBottled != null) doc.text(`Volume:      ${Number(run.totalLitersBottled).toFixed(2)} L`);
  doc.text(`Status:      ${run.status}`);

  doc.moveDown(1);
  doc.fontSize(13).fillColor("#3D4727").text(
    `${origins.length} contributing tree${origins.length === 1 ? "" : "s"} across ${groves.size} grove${groves.size === 1 ? "" : "s"}`,
  );
  doc.fontSize(9).fillColor("#666").text(`Total contribution: ${totalKg.toFixed(2)} kg of olives`);

  doc.moveDown(0.6);
  doc.fontSize(10).fillColor("#3D4727");
  doc.text("Top contributing trees", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#222");

  for (const t of topTrees) {
    const grove = t.groveName ?? "—";
    const line = `  ${(t.treeCode ?? "#" + t.treeId).padEnd(28)} ${grove.padEnd(22)} ${t.contributionKg.toFixed(2).padStart(8)} kg   ${t.sharePct.toFixed(1).padStart(5)}%`;
    doc.font("Courier").text(line);
  }
  if (origins.length > topTrees.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#666").text(`  …and ${origins.length - topTrees.length} more.`);
  }

  // Lab quality summary block
  doc.moveDown(1);
  doc.font("Helvetica").fontSize(10).fillColor("#3D4727").text("Lab quality summary", { underline: true });
  doc.moveDown(0.3);
  if (labFlagged.length === 0) {
    doc.fontSize(9).fillColor("#666").text("  No lab results on file for this run.");
  } else {
    const evCount = labFlagged.filter((l) => l.flags.isExtraVirgin === true).length;
    const hcCount = labFlagged.filter((l) => l.flags.isHealthClaimEligible === true).length;
    doc.fontSize(9).fillColor("#222").text(
      `  ${labFlagged.length} lab result${labFlagged.length === 1 ? "" : "s"} · ` +
      `${evCount} EVOO-eligible · ${hcCount} health-claim eligible (≥250 mg/kg polyphenols)`,
    );
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#222");
    for (const { row: l, flags } of labFlagged) {
      const date = l.sampleDate ?? "—";
      const lab = l.labName ?? "—";
      const acidity = l.acidity != null ? `${Number(l.acidity).toFixed(2)}%` : "—";
      const peroxide = l.peroxideValue != null ? `${Number(l.peroxideValue).toFixed(1)} meq` : "—";
      const polyphenols = l.totalPolyphenolsMgKg != null ? `${Math.round(Number(l.totalPolyphenolsMgKg))} mg/kg` : "—";
      const tags = [
        flags.isExtraVirgin === true ? "EVOO" : null,
        flags.isHealthClaimEligible === true ? "Health claim" : null,
      ].filter(Boolean).join(" · ");
      const line = `  ${date.padEnd(12)} ${lab.padEnd(20)} acidity ${acidity.padEnd(8)} peroxide ${peroxide.padEnd(11)} polyphenols ${polyphenols}${tags ? "   [" + tags + "]" : ""}`;
      doc.font("Courier").text(line);
    }
  }

  doc.moveDown(2);
  doc.font("Helvetica").fontSize(8).fillColor("#888").text(
    "Khalaf Olive Groves does not blend across trees within a single bottling run lot. " +
    "Per-tree contributions are computed by prorating each pressing run's olive weight back to the harvest events on each tree. " +
    "Lab quality flags shown on the public dossier are derived from IOC EVOO thresholds (acidity ≤ 0.8% = EVOO; total polyphenols ≥ 250 mg/kg = EU 432/2012 health-claim eligible).",
    { width: doc.page.width - 96 },
  );

  doc.end();
});

router.get("/reports/lot-trace/:bottlingRunId", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const id = Number(req.params["bottlingRunId"]);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bottlingRun] = await db.select().from(bottlingRunsTable).where(eq(bottlingRunsTable.id, id));
  if (!bottlingRun) { res.status(404).json({ error: "Not found" }); return; }

  const sourceRows = await db.select().from(bottlingRunOilSourcesTable).where(eq(bottlingRunOilSourcesTable.bottlingRunId, id));
  const oilBatchIds = sourceRows.map((s) => s.oilBatchId);
  const oilBatches = oilBatchIds.length
    ? await db.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, oilBatchIds))
    : [];
  const pressingRunIds = Array.from(new Set(oilBatches.map((b) => b.pressingRunId)));
  const pressingRuns = pressingRunIds.length
    ? await db.select().from(pressingRunsTable).where(inArray(pressingRunsTable.id, pressingRunIds))
    : [];
  const harvestBatchIds = Array.from(new Set(pressingRuns.map((p) => p.harvestBatchId)));
  const batches = harvestBatchIds.length
    ? await db.select().from(harvestBatchesTable).where(inArray(harvestBatchesTable.id, harvestBatchIds))
    : [];
  const seasonIds = Array.from(new Set(batches.map((b) => b.harvestSeasonId)));
  const seasons = seasonIds.length
    ? await db.select().from(harvestSeasonsTable).where(inArray(harvestSeasonsTable.id, seasonIds))
    : [];
  const oilMap = new Map(oilBatches.map((b) => [b.id, b]));
  const prMap = new Map(pressingRuns.map((p) => [p.id, p]));
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const seasonMap = new Map(seasons.map((s) => [s.id, s]));

  const sources = sourceRows.map((s) => {
    const ob = oilMap.get(s.oilBatchId);
    const pr = ob ? prMap.get(ob.pressingRunId) : null;
    const hb = pr ? batchMap.get(pr.harvestBatchId) : null;
    const ss = hb ? seasonMap.get(hb.harvestSeasonId) : null;
    return {
      oilBatchId: s.oilBatchId,
      oilBatchCode: ob?.oilBatchCode ?? null,
      litersDrawn: s.litersDrawn,
      pressingRunId: pr?.id ?? null,
      harvestBatchId: hb?.id ?? null,
      batchCode: hb?.batchCode ?? null,
      harvestSeasonId: ss?.id ?? null,
      seasonName: ss?.name ?? null,
      millName: pr?.millName ?? null,
      pressingDelayHours: pr?.pressingDelayHours ?? null,
    };
  });

  const origins = await loadOriginsEnriched(id);
  const treeIds = Array.from(new Set(origins.map((o) => o.treeId)));
  const groveIds = Array.from(new Set(origins.map((o) => o.groveId).filter((g): g is number => g != null)));

  // Grove-level rollup with tree counts.
  const groveAgg = new Map<string, { groveId: number | null; groveName: string | null; contributionKg: number; trees: Set<number> }>();
  let totalContribution = 0;
  for (const o of origins) {
    totalContribution += o.contributionKg;
    const key = o.groveId != null ? `g${o.groveId}` : "ungrouped";
    const cur = groveAgg.get(key) ?? { groveId: o.groveId, groveName: o.groveName, contributionKg: 0, trees: new Set() };
    cur.contributionKg += o.contributionKg;
    cur.trees.add(o.treeId);
    groveAgg.set(key, cur);
  }
  const groveBreakdown = Array.from(groveAgg.values())
    .map((g) => ({
      groveId: g.groveId,
      groveName: g.groveName,
      contributionKg: g.contributionKg,
      sharePct: totalContribution > 0 ? (g.contributionKg / totalContribution) * 100 : 0,
      treeCount: g.trees.size,
    }))
    .sort((a, b) => b.contributionKg - a.contributionKg);

  // Top 25 contributing trees with photos + variety.
  const trees = treeIds.length
    ? await db.select().from(treesTable).where(inArray(treesTable.id, treeIds))
    : [];
  const treeMap = new Map(trees.map((t) => [t.id, t]));
  const groves = groveIds.length
    ? await db.select().from(grovesTable).where(inArray(grovesTable.id, groveIds))
    : [];
  const groveNameMap = new Map(groves.map((g) => [g.id, g.name]));

  // One representative photo per tree (most recent media row referencing it).
  const photoMap = new Map<number, string>();
  if (treeIds.length) {
    const photos = await db
      .select({ treeId: mediaTable.treeId, fileUrl: mediaTable.fileUrl, uploadedAt: mediaTable.uploadedAt })
      .from(mediaTable)
      .where(and(isNotNull(mediaTable.treeId), inArray(mediaTable.treeId, treeIds)))
      .orderBy(desc(mediaTable.uploadedAt));
    for (const p of photos) {
      if (p.treeId != null && !photoMap.has(p.treeId)) {
        photoMap.set(p.treeId, p.fileUrl);
      }
    }
  }

  const topTrees = [...origins]
    .sort((a, b) => b.sharePct - a.sharePct)
    .slice(0, 25)
    .map((o) => {
      const t = treeMap.get(o.treeId);
      return {
        treeId: o.treeId,
        treeCode: t?.treeCode ?? o.treeCode ?? null,
        groveId: o.groveId,
        groveName: o.groveId != null ? groveNameMap.get(o.groveId) ?? o.groveName ?? null : o.groveName ?? null,
        variety: t?.variety ?? null,
        ancientStatus: t?.ancientStatus ?? null,
        contributionKg: o.contributionKg,
        sharePct: o.sharePct,
        photoUrl: photoMap.get(o.treeId) ?? null,
      };
    });

  // Heritage rule evidence touched by any tree, grove, or harvest batch in this trace.
  const evWhere = [
    treeIds.length ? inArray(ruleEvidenceTable.treeId, treeIds) : null,
    groveIds.length ? inArray(ruleEvidenceTable.groveId, groveIds) : null,
    harvestBatchIds.length ? inArray(ruleEvidenceTable.harvestBatchId, harvestBatchIds) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);
  let heritageEvidence: Array<{
    id: number; heritageRuleId: number; ruleCode: string; ruleName: string;
    treeId: number | null; groveId: number | null; harvestBatchId: number | null;
    metricName: string; metricValue: string; interpretation: string | null; confidenceLevel: string;
  }> = [];
  if (evWhere.length) {
    const evRows = await db.select().from(ruleEvidenceTable).where(or(...evWhere));
    if (evRows.length) {
      const ruleIds = Array.from(new Set(evRows.map((e) => e.heritageRuleId)));
      const rules = await db.select().from(heritageRulesTable).where(inArray(heritageRulesTable.id, ruleIds));
      const ruleMap = new Map(rules.map((r) => [r.id, r]));
      heritageEvidence = evRows.map((e) => {
        const r = ruleMap.get(e.heritageRuleId);
        return {
          id: e.id,
          heritageRuleId: e.heritageRuleId,
          ruleCode: r?.ruleCode ?? `rule#${e.heritageRuleId}`,
          ruleName: r?.name ?? "—",
          treeId: e.treeId,
          groveId: e.groveId,
          harvestBatchId: e.harvestBatchId,
          metricName: e.metricName,
          metricValue: e.metricValue,
          interpretation: e.interpretation,
          confidenceLevel: e.confidenceLevel,
        };
      });
    }
  }

  // Lab results — if the run pins a quality_basis_lab_result_ids list, use it
  // verbatim; otherwise fall back to all lab results attached to oil batches in
  // this lot.
  let labResults: Array<typeof labResultsTable.$inferSelect> = [];
  const pinnedIds = bottlingRun.qualityBasisLabResultIds ?? null;
  if (pinnedIds && pinnedIds.length > 0) {
    labResults = await db.select().from(labResultsTable).where(inArray(labResultsTable.id, pinnedIds));
  } else if (oilBatchIds.length) {
    labResults = await db.select().from(labResultsTable).where(inArray(labResultsTable.oilBatchId, oilBatchIds));
  }

  const totalLitersDrawn = sourceRows.reduce((s, r) => s + r.litersDrawn, 0);

  res.json({
    bottlingRun: { ...bottlingRun, sourceCount: sourceRows.length },
    sources,
    origins,
    totalContributionKg: totalContribution,
    totalLitersDrawn,
    treeCount: treeIds.length,
    groveBreakdown,
    topTrees,
    heritageEvidence,
    labResults,
  });
});

export default router;
