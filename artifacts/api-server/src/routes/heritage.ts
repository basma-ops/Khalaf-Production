import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { heritageRulesTable, ruleEvidenceTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateHeritageRuleBody,
  GetHeritageRuleParams,
  UpdateHeritageRuleParams,
  UpdateHeritageRuleBody,
  GetHeritageRuleEvidenceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/heritage-rules", async (_req, res) => {
  const rules = await db.select().from(heritageRulesTable);
  res.json(rules);
});

router.post("/heritage-rules", async (req, res) => {
  const body = CreateHeritageRuleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [rule] = await db.insert(heritageRulesTable).values(body.data).returning();
  res.status(201).json(rule);
});

router.get("/heritage-rules/:id", async (req, res) => {
  const params = GetHeritageRuleParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [rule] = await db.select().from(heritageRulesTable).where(eq(heritageRulesTable.id, params.data.id));
  if (!rule) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rule);
});

router.patch("/heritage-rules/:id", async (req, res) => {
  const params = UpdateHeritageRuleParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateHeritageRuleBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(heritageRulesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(heritageRulesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.get("/heritage-rules/:id/evidence", async (req, res) => {
  const params = GetHeritageRuleEvidenceParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const evidence = await db.select().from(ruleEvidenceTable).where(eq(ruleEvidenceTable.heritageRuleId, params.data.id));
  res.json(evidence);
});

export default router;
