import { Router, type IRouter } from "express";
import {
  db,
  treesTable as trees,
  grovesTable as groves,
  mediaTable,
  bottlingRunsTable as bottlingRuns,
  bottlingRunOilSourcesTable,
  bottleOriginsTable,
  oilBatchesTable,
  pressingRunsTable,
  harvestBatchesTable,
  harvestSeasonsTable,
  labResultsTable,
} from "@workspace/db";
import { sql, eq, desc, inArray, and, or, isNotNull } from "drizzle-orm";
import { withLabFlags } from "./pressing";

const router: IRouter = Router();

router.get("/public/grove-status", async (_req, res, next) => {
  try {
    const [stats] = await db
      .select({
        totalTrees: sql<number>`COUNT(*)::int`,
        ancientVerified: sql<number>`COUNT(*) FILTER (WHERE ${trees.ancientStatus} = 'verified')::int`,
        ancientCandidates: sql<number>`COUNT(*) FILTER (WHERE ${trees.ancientStatus} = 'candidate')::int`,
        avgHealth: sql<number | null>`AVG(${trees.currentHealthIndex})`,
      })
      .from(trees);

    const [groveStats] = await db
      .select({
        totalGroves: sql<number>`COUNT(*)::int`,
        totalAreaHa: sql<string>`COALESCE(SUM(${groves.areaHa}), 0)::text`,
      })
      .from(groves);

    const [mediaStats] = await db
      .select({ totalMedia: sql<number>`COUNT(*)::int` })
      .from(mediaTable);

    const [bottlingStats] = await db
      .select({ totalBottlingRuns: sql<number>`COUNT(*)::int` })
      .from(bottlingRuns);

    res.json({
      heritage: {
        founded: 1862,
        generations: 5,
        origin: "Rameh, Upper Galilee",
        cultivar: "Souri",
      },
      stats: {
        totalTrees: stats?.totalTrees ?? 0,
        ancientVerified: stats?.ancientVerified ?? 0,
        ancientCandidates: stats?.ancientCandidates ?? 0,
        averageHealthIndex:
          stats?.avgHealth != null ? Number(stats.avgHealth) : null,
        totalGroves: groveStats?.totalGroves ?? 0,
        totalAreaHa: Number(groveStats?.totalAreaHa ?? "0"),
        documentedPhotos: mediaStats?.totalMedia ?? 0,
        bottlingRuns: bottlingStats?.totalBottlingRuns ?? 0,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/groves", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: groves.id,
        code: groves.groveCode,
        name: groves.name,
        areaHa: groves.areaHa,
        treeCount: sql<number>`COUNT(${trees.id})::int`,
        ancientCount: sql<number>`COUNT(*) FILTER (WHERE ${trees.ancientStatus} IN ('verified','candidate'))::int`,
        avgHealth: sql<number | null>`AVG(${trees.currentHealthIndex})`,
      })
      .from(groves)
      .leftJoin(trees, eq(trees.groveId, groves.id))
      .groupBy(groves.id)
      .orderBy(desc(groves.areaHa));

    res.json(
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        areaHa: r.areaHa != null ? Number(r.areaHa) : null,
        treeCount: r.treeCount,
        ancientCount: r.ancientCount,
        averageHealthIndex: r.avgHealth != null ? Number(r.avgHealth) : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get("/public/featured-trees", async (_req, res, next) => {
  try {
    const cols = {
      id: trees.id,
      treeCode: trees.treeCode,
      variety: trees.variety,
      ancientStatus: trees.ancientStatus,
      estimatedAgeClass: trees.estimatedAgeClass,
      crownDiameterM: trees.crownDiameterM,
      crownAreaM2: trees.crownAreaM2,
      currentHealthIndex: trees.currentHealthIndex,
      groveName: groves.name,
      groveCode: groves.groveCode,
      photoCount: sql<number>`(select count(*) from media where media.tree_id = ${trees.id})`.as("photo_count"),
    };

    // Date-seeded rotation: deterministic per-day rotation of the eligible set
    // so the home page does not always feature the same 8 trees.
    const today = new Date().toISOString().slice(0, 10);
    const seed = Array.from(today).reduce((s, c) => s + c.charCodeAt(0), 0) % 997;

    // Primary: field-verified, photo-rich (>=1 photo). Rotate via seed.
    let featured = await db
      .select(cols)
      .from(trees)
      .leftJoin(groves, eq(groves.id, trees.groveId))
      .where(sql`${trees.verificationStatus} = 'field_verified'
        and (select count(*) from media where media.tree_id = ${trees.id}) > 0`)
      .orderBy(sql`((${trees.id} + ${seed}) % 100)`, desc(trees.crownDiameterM))
      .limit(8);

    // Fallback 1: any verified ancient/candidate, photo-rich.
    if (featured.length < 8) {
      const need = 8 - featured.length;
      const have = new Set(featured.map((t) => t.id));
      const more = await db
        .select(cols)
        .from(trees)
        .leftJoin(groves, eq(groves.id, trees.groveId))
        .where(sql`${trees.ancientStatus} IN ('verified','candidate')
          and (select count(*) from media where media.tree_id = ${trees.id}) > 0`)
        .orderBy(sql`((${trees.id} + ${seed}) % 100)`, desc(trees.crownDiameterM))
        .limit(need + featured.length);
      for (const t of more) {
        if (have.has(t.id)) continue;
        featured.push(t);
        if (featured.length >= 8) break;
      }
    }

    // Fallback 2 (empty install): any tree with a crown, no photo requirement.
    if (featured.length === 0) {
      featured = await db
        .select(cols)
        .from(trees)
        .leftJoin(groves, eq(groves.id, trees.groveId))
        .where(sql`${trees.crownDiameterM} IS NOT NULL`)
        .orderBy(desc(trees.crownDiameterM), desc(trees.currentHealthIndex))
        .limit(8);
    }

    res.json(
      featured.map((t) => ({
        id: t.id,
        treeCode: t.treeCode,
        variety: t.variety,
        ancientStatus: t.ancientStatus,
        estimatedAgeClass: t.estimatedAgeClass,
        crownDiameterM:
          t.crownDiameterM != null ? Number(t.crownDiameterM) : null,
        crownAreaM2: t.crownAreaM2 != null ? Number(t.crownAreaM2) : null,
        currentHealthIndex:
          t.currentHealthIndex != null ? Number(t.currentHealthIndex) : null,
        groveName: t.groveName,
        groveCode: t.groveCode,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get("/public/bottling-runs/:token", async (req, res, next) => {
  try {
    const token = String(req.params["token"] ?? "");
    if (!token || token.length < 4 || token.length > 64) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [run] = await db.select().from(bottlingRuns).where(eq(bottlingRuns.publicToken, token));
    if (!run) { res.status(404).json({ error: "Not found" }); return; }

    // Sources → upstream chain (oil batch → pressing run → harvest batch → season).
    const sourceRows = await db
      .select()
      .from(bottlingRunOilSourcesTable)
      .where(eq(bottlingRunOilSourcesTable.bottlingRunId, run.id));
    const oilBatchIds = sourceRows.map((s) => s.oilBatchId);
    const oilBatches = oilBatchIds.length
      ? await db.select().from(oilBatchesTable).where(inArray(oilBatchesTable.id, oilBatchIds))
      : [];
    const pressingRunIds = Array.from(new Set(oilBatches.map((b) => b.pressingRunId)));
    const prs = pressingRunIds.length
      ? await db.select().from(pressingRunsTable).where(inArray(pressingRunsTable.id, pressingRunIds))
      : [];
    const batchIds = Array.from(new Set(prs.map((p) => p.harvestBatchId)));
    const batches = batchIds.length
      ? await db.select().from(harvestBatchesTable).where(inArray(harvestBatchesTable.id, batchIds))
      : [];
    const seasonIds = Array.from(new Set(batches.map((b) => b.harvestSeasonId)));
    const seasons = seasonIds.length
      ? await db.select().from(harvestSeasonsTable).where(inArray(harvestSeasonsTable.id, seasonIds))
      : [];
    const oilMap = new Map(oilBatches.map((b) => [b.id, b]));
    const prMap = new Map(prs.map((p) => [p.id, p]));
    const batchMap = new Map(batches.map((b) => [b.id, b]));
    const seasonMap = new Map(seasons.map((s) => [s.id, s]));

    const sources = sourceRows.map((s) => {
      const ob = oilMap.get(s.oilBatchId);
      const pr = ob ? prMap.get(ob.pressingRunId) : null;
      const hb = pr ? batchMap.get(pr.harvestBatchId) : null;
      const ss = hb ? seasonMap.get(hb.harvestSeasonId) : null;
      return {
        oilBatchCode: ob?.oilBatchCode ?? null,
        litersDrawn: s.litersDrawn,
        batchCode: hb?.batchCode ?? null,
        seasonName: ss?.name ?? null,
        millName: pr?.millName ?? null,
        pressingDelayHours: pr?.pressingDelayHours ?? null,
        harvestDate: hb?.batchDate ?? null,
        pressingStartedAt: pr?.pressingStartedAt ? pr.pressingStartedAt.toISOString() : null,
        pressingCompletedAt: pr?.pressingCompletedAt ? pr.pressingCompletedAt.toISOString() : null,
      };
    });

    // Bottle origins (per-tree shares).
    const origins = await db
      .select({
        treeId: bottleOriginsTable.treeId,
        groveId: bottleOriginsTable.groveId,
        contributionKg: bottleOriginsTable.contributionKg,
        sharePct: bottleOriginsTable.sharePct,
        treeCode: trees.treeCode,
        variety: trees.variety,
        ancientStatus: trees.ancientStatus,
        estimatedAgeClass: trees.estimatedAgeClass,
        crownDiameterM: trees.crownDiameterM,
        groveName: groves.name,
        groveCode: groves.groveCode,
      })
      .from(bottleOriginsTable)
      .leftJoin(trees, eq(trees.id, bottleOriginsTable.treeId))
      .leftJoin(groves, eq(groves.id, bottleOriginsTable.groveId))
      .where(eq(bottleOriginsTable.bottlingRunId, run.id));

    let totalContributionKg = 0;
    const groveAgg = new Map<string, {
      groveId: number | null; groveName: string | null; groveCode: string | null;
      contributionKg: number; trees: Set<number>;
    }>();
    for (const o of origins) {
      totalContributionKg += o.contributionKg;
      const key = o.groveId != null ? `g${o.groveId}` : "u";
      const cur = groveAgg.get(key) ?? {
        groveId: o.groveId, groveName: o.groveName, groveCode: o.groveCode,
        contributionKg: 0, trees: new Set<number>(),
      };
      cur.contributionKg += o.contributionKg;
      cur.trees.add(o.treeId);
      groveAgg.set(key, cur);
    }
    const groveBreakdown = Array.from(groveAgg.values())
      .map((g) => ({
        groveName: g.groveName,
        groveCode: g.groveCode,
        contributionKg: g.contributionKg,
        sharePct: totalContributionKg > 0 ? (g.contributionKg / totalContributionKg) * 100 : 0,
        treeCount: g.trees.size,
      }))
      .sort((a, b) => b.contributionKg - a.contributionKg);

    // One representative photo per tree (most recent media row).
    const treeIds = Array.from(new Set(origins.map((o) => o.treeId)));
    const photoMap = new Map<number, string>();
    if (treeIds.length) {
      const photos = await db
        .select({ treeId: mediaTable.treeId, fileUrl: mediaTable.thumbnailUrl, full: mediaTable.fileUrl })
        .from(mediaTable)
        .where(and(isNotNull(mediaTable.treeId), inArray(mediaTable.treeId, treeIds)))
        .orderBy(desc(mediaTable.uploadedAt));
      for (const p of photos) {
        if (p.treeId != null && !photoMap.has(p.treeId)) {
          photoMap.set(p.treeId, p.fileUrl ?? p.full ?? "");
        }
      }
    }

    // Expose every contributing tree (no truncation) for full provenance
    // transparency. The UI may paginate or "show more" but the data is here.
    const topTrees = [...origins]
      .sort((a, b) => b.sharePct - a.sharePct)
      .map((o) => ({
        treeId: o.treeId,
        treeCode: o.treeCode ?? `#${o.treeId}`,
        groveName: o.groveName,
        variety: o.variety,
        ancientStatus: o.ancientStatus,
        estimatedAgeClass: o.estimatedAgeClass,
        crownDiameterM: o.crownDiameterM != null ? Number(o.crownDiameterM) : null,
        contributionKg: o.contributionKg,
        sharePct: o.sharePct,
        photoUrl: photoMap.get(o.treeId) || null,
      }));

    // Lab results: pinned IDs win, else all from contributing oil batches.
    let labRows: Array<typeof labResultsTable.$inferSelect> = [];
    const pinnedIds = run.qualityBasisLabResultIds ?? null;
    if (pinnedIds && pinnedIds.length > 0) {
      labRows = await db.select().from(labResultsTable).where(inArray(labResultsTable.id, pinnedIds));
    } else if (oilBatchIds.length) {
      labRows = await db.select().from(labResultsTable).where(inArray(labResultsTable.oilBatchId, oilBatchIds));
    }
    const labResults = labRows.map((l) => {
      const flags = withLabFlags(l);
      return {
        sampleDate: l.sampleDate,
        labName: l.labName,
        acidity: l.acidity != null ? Number(l.acidity) : null,
        peroxideValue: l.peroxideValue != null ? Number(l.peroxideValue) : null,
        totalPolyphenolsMgKg: l.totalPolyphenolsMgKg != null ? Number(l.totalPolyphenolsMgKg) : null,
        k232: l.k232 != null ? Number(l.k232) : null,
        k270: l.k270 != null ? Number(l.k270) : null,
        isExtraVirgin: flags.isExtraVirgin,
        isHealthClaimEligible: flags.isHealthClaimEligible,
      };
    });

    res.json({
      bottlingRun: {
        runCode: run.runCode,
        bottledAt: run.bottledAt,
        label: run.label,
        lotCode: run.lotCode,
        format: run.format,
        bottleSizeMl: run.bottleSizeMl,
        bottlesProduced: run.bottlesProduced,
        totalLitersBottled: run.totalLitersBottled != null ? Number(run.totalLitersBottled) : null,
        singleTree: run.singleTree,
        singleGrove: run.singleGrove,
        status: run.status,
        publicToken: run.publicToken!,
      },
      sources,
      totalContributionKg,
      totalLitersDrawn: sourceRows.reduce((s, r) => s + r.litersDrawn, 0),
      treeCount: treeIds.length,
      groveBreakdown,
      topTrees,
      labResults,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public/trees/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) { res.status(404).json({ error: "Not found" }); return; }
    const [row] = await db
      .select({
        id: trees.id,
        treeCode: trees.treeCode,
        variety: trees.variety,
        ancientStatus: trees.ancientStatus,
        estimatedAgeClass: trees.estimatedAgeClass,
        crownDiameterM: trees.crownDiameterM,
        crownAreaM2: trees.crownAreaM2,
        currentHealthIndex: trees.currentHealthIndex,
        centroidLat: trees.centroidLat,
        centroidLon: trees.centroidLon,
        groveName: groves.name,
        groveCode: groves.groveCode,
      })
      .from(trees)
      .leftJoin(groves, eq(groves.id, trees.groveId))
      .where(
        and(
          eq(trees.id, id),
          // Only publish trees that have been field-verified, OR are
          // ancient verified/candidate. Unvetted trees stay private.
          or(
            eq(trees.verificationStatus, "field_verified"),
            sql`${trees.ancientStatus} IN ('verified','candidate')`,
          ),
        ),
      );
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const photos = await db
      .select({
        id: mediaTable.id,
        fileUrl: mediaTable.fileUrl,
        thumbnailUrl: mediaTable.thumbnailUrl,
        capturedAt: mediaTable.capturedAt,
      })
      .from(mediaTable)
      .where(eq(mediaTable.treeId, id))
      .orderBy(desc(mediaTable.uploadedAt))
      .limit(6);
    res.json({
      id: row.id,
      treeCode: row.treeCode,
      variety: row.variety,
      ancientStatus: row.ancientStatus,
      estimatedAgeClass: row.estimatedAgeClass,
      crownDiameterM: row.crownDiameterM != null ? Number(row.crownDiameterM) : null,
      crownAreaM2: row.crownAreaM2 != null ? Number(row.crownAreaM2) : null,
      currentHealthIndex: row.currentHealthIndex != null ? Number(row.currentHealthIndex) : null,
      centroidLat: row.centroidLat != null ? Number(row.centroidLat) : null,
      centroidLon: row.centroidLon != null ? Number(row.centroidLon) : null,
      groveName: row.groveName,
      groveCode: row.groveCode,
      photoCount: photos.length,
      photos: photos
        .filter((p) => p.fileUrl)
        .map((p) => ({
          id: p.id,
          fileUrl: p.fileUrl!,
          thumbnailUrl: p.thumbnailUrl,
          capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
        })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
