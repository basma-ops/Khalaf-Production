import { pgTable, serial, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const heritageRulesTable = pgTable("heritage_rules", {
  id: serial("id").primaryKey(),
  ruleCode: text("rule_code").notNull().unique(),
  name: text("name").notNull(),
  traditionalRule: text("traditional_rule"),
  heritageRationale: text("heritage_rationale"),
  scientificHypothesis: text("scientific_hypothesis"),
  dataNeeded: text("data_needed"),
  status: text("status").notNull().default("hypothesis"),
  climateRisk: text("climate_risk"),
  recommendedActionTemplate: text("recommended_action_template"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ruleEvidenceTable = pgTable("rule_evidence", {
  id: serial("id").primaryKey(),
  heritageRuleId: integer("heritage_rule_id").notNull(),
  groveId: integer("grove_id"),
  treeId: integer("tree_id"),
  satelliteObservationId: integer("satellite_observation_id"),
  fieldVisitId: integer("field_visit_id"),
  harvestEventId: integer("harvest_event_id"),
  harvestBatchId: integer("harvest_batch_id"),
  labResultId: integer("lab_result_id"),
  metricName: text("metric_name").notNull(),
  metricValue: text("metric_value").notNull(),
  interpretation: text("interpretation"),
  confidenceLevel: text("confidence_level").notNull().default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHeritageRuleSchema = createInsertSchema(heritageRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHeritageRule = z.infer<typeof insertHeritageRuleSchema>;
export type HeritageRule = typeof heritageRulesTable.$inferSelect;

export const insertRuleEvidenceSchema = createInsertSchema(ruleEvidenceTable).omit({ id: true, createdAt: true });
export type InsertRuleEvidence = z.infer<typeof insertRuleEvidenceSchema>;
export type RuleEvidence = typeof ruleEvidenceTable.$inferSelect;
