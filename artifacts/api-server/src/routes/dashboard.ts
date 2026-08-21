import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  grovesTable, treesTable, satelliteAlertsTable, tasksTable,
  harvestSeasonsTable, harvestEventsTable, harvestBatchesTable,
  labResultsTable, heritageRulesTable, ruleEvidenceTable,
} from "@workspace/db";
import { eq, count, avg, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/overview", async (_req, res) => {
  const [groveCount] = await db.select({ count: count(grovesTable.id) }).from(grovesTable);
  const [treeCount] = await db.select({ count: count(treesTable.id) }).from(treesTable);
  const [ancientCount] = await db.select({ count: count(treesTable.id) }).from(treesTable).where(eq(treesTable.ancientStatus, "confirmed_ancient"));
  const [openAlerts] = await db.select({ count: count(satelliteAlertsTable.id) }).from(satelliteAlertsTable).where(eq(satelliteAlertsTable.status, "open"));
  const [urgentAlerts] = await db.select({ count: count(satelliteAlertsTable.id) }).from(satelliteAlertsTable).where(and(eq(satelliteAlertsTable.status, "open"), eq(satelliteAlertsTable.severity, "critical")));
  const [openTasks] = await db.select({ count: count(tasksTable.id) }).from(tasksTable).where(eq(tasksTable.status, "open"));
  const [urgentTasks] = await db.select({ count: count(tasksTable.id) }).from(tasksTable).where(and(eq(tasksTable.status, "open"), eq(tasksTable.priority, "high")));
  const [avgHealth] = await db.select({ avg: avg(treesTable.currentHealthIndex) }).from(treesTable);
  const [pendingLab] = await db.select({ count: count(labResultsTable.id) }).from(labResultsTable);
  const activeSeason = await db.select().from(harvestSeasonsTable).where(eq(harvestSeasonsTable.status, "active")).limit(1);
  let harvestedToday = 0;
  let boxesToday = 0;
  let openBatches = 0;
  if (activeSeason.length > 0) {
    const today = new Date().toISOString().split("T")[0]!;
    const todayEvents = await db.select({ count: count(harvestEventsTable.id) }).from(harvestEventsTable).where(and(eq(harvestEventsTable.harvestSeasonId, activeSeason[0]!.id), eq(harvestEventsTable.harvestDate, today)));
    harvestedToday = Number(todayEvents[0]?.count ?? 0);
    const [batchCount] = await db.select({ count: count(harvestBatchesTable.id) }).from(harvestBatchesTable).where(eq(harvestBatchesTable.status, "open"));
    openBatches = Number(batchCount?.count ?? 0);
  }
  res.json({
    totalGroves: Number(groveCount?.count ?? 0),
    totalActiveTrees: Number(treeCount?.count ?? 0),
    verifiedAncientTrees: Number(ancientCount?.count ?? 0),
    openSatelliteAlerts: Number(openAlerts?.count ?? 0),
    urgentSatelliteAlerts: Number(urgentAlerts?.count ?? 0),
    openFieldTasks: Number(openTasks?.count ?? 0),
    urgentFieldTasks: Number(urgentTasks?.count ?? 0),
    averageTreeHealthIndex: Number(avgHealth?.avg ?? 0),
    terraceRiskAlerts: 0,
    activeHarvestSeason: activeSeason[0] ?? null,
    harvestedTreesToday: harvestedToday,
    boxesCollectedToday: boxesToday,
    openHarvestBatches: openBatches,
    pendingLabResults: Number(pendingLab?.count ?? 0),
  });
});

router.get("/dashboard/harvest-summary", async (_req, res) => {
  const activeSeason = await db.select().from(harvestSeasonsTable).where(eq(harvestSeasonsTable.status, "active")).limit(1);
  const groves = await db.select().from(grovesTable);
  if (!activeSeason.length) { res.json({ season: null, groveProgress: [] }); return; }
  const season = activeSeason[0]!;
  const [totalTrees] = await db.select({ count: count(treesTable.id) }).from(treesTable);
  const [harvestedTrees] = await db.select({ count: count(harvestEventsTable.id) }).from(harvestEventsTable).where(eq(harvestEventsTable.harvestSeasonId, season.id));
  const [totalBatches] = await db.select({ count: count(harvestBatchesTable.id) }).from(harvestBatchesTable).where(eq(harvestBatchesTable.harvestSeasonId, season.id));
  const groveProgress = await Promise.all(groves.map(async (g) => {
    const [total] = await db.select({ count: count(treesTable.id) }).from(treesTable).where(eq(treesTable.groveId, g.id));
    const [harvested] = await db.select({ count: count(harvestEventsTable.id) }).from(harvestEventsTable).where(and(eq(harvestEventsTable.groveId, g.id), eq(harvestEventsTable.harvestSeasonId, season.id)));
    return { groveId: g.id, groveName: g.name, groveCode: g.groveCode, totalTrees: Number(total?.count ?? 0), harvestedTrees: Number(harvested?.count ?? 0) };
  }));
  res.json({ season, totalTrees: Number(totalTrees?.count ?? 0), harvestedTrees: Number(harvestedTrees?.count ?? 0), totalBatches: Number(totalBatches?.count ?? 0), groveProgress });
});

router.get("/dashboard/alert-breakdown", async (_req, res) => {
  const allAlerts = await db.select().from(satelliteAlertsTable);
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const a of allAlerts) {
    byType[a.alertType] = (byType[a.alertType] ?? 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  }
  res.json({ total: allAlerts.length, byType, bySeverity, byStatus });
});

router.get("/dashboard/heritage-signals", async (_req, res) => {
  const rules = await db.select().from(heritageRulesTable);
  const result = await Promise.all(rules.map(async (r) => {
    const [evidenceCount] = await db.select({ count: count(ruleEvidenceTable.id) }).from(ruleEvidenceTable).where(eq(ruleEvidenceTable.heritageRuleId, r.id));
    return { ...r, evidenceCount: Number(evidenceCount?.count ?? 0) };
  }));
  res.json(result);
});

export default router;
