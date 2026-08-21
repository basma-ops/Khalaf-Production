import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  grovesTable,
  treesTable,
  satelliteAlertsTable,
  tasksTable,
  harvestSeasonsTable,
  harvestEventsTable,
  fieldVisitsTable,
} from "@workspace/db";
import { eq, count, avg, and, gte, ne, sql } from "drizzle-orm";
import {
  CreateGroveBody,
  GetGroveParams,
  UpdateGroveParams,
  UpdateGroveBody,
  GetGroveSummaryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/groves", async (_req, res) => {
  const groves = await db.select().from(grovesTable);
  res.json(groves);
});

router.post("/groves", async (req, res) => {
  const body = CreateGroveBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [grove] = await db.insert(grovesTable).values(body.data).returning();
  res.status(201).json(grove);
});

router.get("/groves/:id", async (req, res) => {
  const params = GetGroveParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [grove] = await db.select().from(grovesTable).where(eq(grovesTable.id, params.data.id));
  if (!grove) { res.status(404).json({ error: "Not found" }); return; }
  res.json(grove);
});

router.patch("/groves/:id", async (req, res) => {
  const params = UpdateGroveParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateGroveBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const now = new Date();
  const [updated] = await db.update(grovesTable).set({ ...body.data, updatedAt: now }).where(eq(grovesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.get("/groves/:id/summary", async (req, res) => {
  const params = GetGroveSummaryParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { id } = params.data;
  const [grove] = await db.select().from(grovesTable).where(eq(grovesTable.id, id));
  if (!grove) { res.status(404).json({ error: "Not found" }); return; }

  const [treeStats] = await db
    .select({ treeCount: count(treesTable.id), avgHealth: avg(treesTable.currentHealthIndex) })
    .from(treesTable)
    .where(eq(treesTable.groveId, id));

  // "verified" matches the OpenAPI Tree.ancientStatus enum; legacy data may
  // still carry "confirmed_ancient", so we accept both for backward compat.
  const [ancientStats] = await db
    .select({ count: count(treesTable.id) })
    .from(treesTable)
    .where(and(
      eq(treesTable.groveId, id),
      sql`${treesTable.ancientStatus} IN ('verified', 'confirmed_ancient')`,
    ));

  const [alertCount] = await db
    .select({ count: count(satelliteAlertsTable.id) })
    .from(satelliteAlertsTable)
    .where(and(eq(satelliteAlertsTable.groveId, id), eq(satelliteAlertsTable.status, "open")));

  const [taskCount] = await db
    .select({ count: count(tasksTable.id) })
    .from(tasksTable)
    .where(and(eq(tasksTable.groveId, id), ne(tasksTable.status, "completed")));

  // Active harvest season → distinct trees harvested this season for this
  // grove. Falls back to 0 when no active season exists.
  const [activeSeason] = await db
    .select({ id: harvestSeasonsTable.id })
    .from(harvestSeasonsTable)
    .where(eq(harvestSeasonsTable.status, "active"))
    .limit(1);
  let harvestedTreesThisSeason = 0;
  if (activeSeason) {
    const [row] = await db
      .select({ count: sql<number>`count(distinct ${harvestEventsTable.treeId})` })
      .from(harvestEventsTable)
      .where(and(
        eq(harvestEventsTable.groveId, id),
        eq(harvestEventsTable.harvestSeasonId, activeSeason.id),
      ));
    harvestedTreesThisSeason = Number(row?.count ?? 0);
  }

  // Field visits in the last 30 days for this grove.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentVisitCount] = await db
    .select({ count: count(fieldVisitsTable.id) })
    .from(fieldVisitsTable)
    .where(and(
      eq(fieldVisitsTable.groveId, id),
      gte(fieldVisitsTable.visitDate, thirtyDaysAgo),
    ));

  const avgHealthRaw = treeStats?.avgHealth;
  const averageHealthIndex =
    avgHealthRaw == null ? null : Number(avgHealthRaw);

  res.json({
    grove,
    treeCount: Number(treeStats?.treeCount ?? 0),
    ancientTreeCount: Number(ancientStats?.count ?? 0),
    openAlertCount: Number(alertCount?.count ?? 0),
    openTaskCount: Number(taskCount?.count ?? 0),
    averageHealthIndex,
    harvestedTreesThisSeason,
    recentVisits: Number(recentVisitCount?.count ?? 0),
  });
});

export default router;
