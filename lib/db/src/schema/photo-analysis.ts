import { pgTable, serial, text, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const photoBatchesTable = pgTable("photo_batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  context: text("context").notNull().default("general_tree_review"),
  status: text("status").notNull().default("created"),
  createdByUserId: integer("created_by_user_id"),
  notes: text("notes"),
  totalItems: integer("total_items").notNull().default(0),
  analyzedItems: integer("analyzed_items").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const photoBatchItemsTable = pgTable("photo_batch_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  mediaId: integer("media_id").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const photoAnalysisJobsTable = pgTable("photo_analysis_jobs", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id").notNull(),
  batchId: integer("batch_id"),
  context: text("context").notNull().default("general_tree_review"),
  provider: text("provider").notNull().default("local_heuristic"),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const photoAnalysisResultsTable = pgTable("photo_analysis_results", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  mediaId: integer("media_id").notNull(),
  treeId: integer("tree_id"),
  groveId: integer("grove_id"),
  provider: text("provider").notNull(),
  context: text("context").notNull(),
  // Image quality (always populated by local_heuristic)
  imageQuality: text("image_quality"),
  blurScore: real("blur_score"),
  brightnessScore: real("brightness_score"),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  // Cautious vision findings (vision model only)
  canopyDensity: text("canopy_density"),
  canopyGreennessScore: real("canopy_greenness_score"),
  yellowingSignal: text("yellowing_signal"),
  droughtStressVisualSignal: text("drought_stress_visual_signal"),
  pruningNeedSignal: text("pruning_need_signal"),
  fruitMaturityVisualEstimate: text("fruit_maturity_visual_estimate"),
  fruitDamageSignal: text("fruit_damage_signal"),
  understoryVisualSignal: text("understory_visual_signal"),
  trunkConditionSignal: text("trunk_condition_signal"),
  rootExposureSignal: text("root_exposure_signal"),
  terraceConditionSignal: text("terrace_condition_signal"),
  // Pest/disease cues - JSON array of {cue, severity, notes}
  possiblePestOrDiseaseCues: jsonb("possible_pest_or_disease_cues"),
  // Cautious summary fields
  summary: text("summary"),
  limitations: text("limitations"),
  recommendedFollowUp: text("recommended_follow_up"),
  recommendedTaskType: text("recommended_task_type"),
  confidenceScore: real("confidence_score"),
  needsFieldVerification: text("needs_field_verification").notNull().default("yes"),
  rawJson: jsonb("raw_json"),
  // Manager review state
  reviewStatus: text("review_status").notNull().default("pending"),
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdTaskId: integer("created_task_id"),
  linkedHeritageRuleId: integer("linked_heritage_rule_id"),
  linkedRuleEvidenceId: integer("linked_rule_evidence_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPhotoBatchSchema = createInsertSchema(photoBatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPhotoBatch = z.infer<typeof insertPhotoBatchSchema>;
export type PhotoBatch = typeof photoBatchesTable.$inferSelect;

export const insertPhotoBatchItemSchema = createInsertSchema(photoBatchItemsTable).omit({ id: true, createdAt: true });
export type InsertPhotoBatchItem = z.infer<typeof insertPhotoBatchItemSchema>;
export type PhotoBatchItem = typeof photoBatchItemsTable.$inferSelect;

export const insertPhotoAnalysisJobSchema = createInsertSchema(photoAnalysisJobsTable).omit({ id: true, createdAt: true });
export type InsertPhotoAnalysisJob = z.infer<typeof insertPhotoAnalysisJobSchema>;
export type PhotoAnalysisJob = typeof photoAnalysisJobsTable.$inferSelect;

export const insertPhotoAnalysisResultSchema = createInsertSchema(photoAnalysisResultsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPhotoAnalysisResult = z.infer<typeof insertPhotoAnalysisResultSchema>;
export type PhotoAnalysisResult = typeof photoAnalysisResultsTable.$inferSelect;
