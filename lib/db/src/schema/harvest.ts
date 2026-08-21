import { pgTable, serial, text, real, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const harvestSeasonsTable = pgTable("harvest_seasons", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const harvestEventsTable = pgTable("harvest_events", {
  id: serial("id").primaryKey(),
  harvestSeasonId: integer("harvest_season_id").notNull(),
  groveId: integer("grove_id").notNull(),
  treeId: integer("tree_id").notNull(),
  harvestDate: text("harvest_date").notNull(),
  status: text("status").notNull().default("not_started"),
  startedByWorkerId: integer("started_by_worker_id").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedByWorkerId: integer("completed_by_worker_id"),
  completedAt: timestamp("completed_at"),
  preHarvestTreePhotoUrl: text("pre_harvest_tree_photo_url"),
  fruitConditionNotes: text("fruit_condition_notes"),
  fruitMaturityScore: real("fruit_maturity_score"),
  pestDamageSeen: boolean("pest_damage_seen"),
  pestDamageNotes: text("pest_damage_notes"),
  workerCount: integer("worker_count"),
  totalBoxes: integer("total_boxes"),
  totalEstimatedWeightKg: real("total_estimated_weight_kg"),
  totalMeasuredWeightKg: real("total_measured_weight_kg"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const harvestEventWorkersTable = pgTable("harvest_event_workers", {
  id: serial("id").primaryKey(),
  harvestEventId: integer("harvest_event_id").notNull(),
  workerId: integer("worker_id").notNull(),
  role: text("role").notNull().default("picker"),
});

export const harvestBoxesTable = pgTable("harvest_boxes", {
  id: serial("id").primaryKey(),
  harvestEventId: integer("harvest_event_id").notNull(),
  boxCode: text("box_code").notNull(),
  boxSequenceNumber: integer("box_sequence_number").notNull(),
  photoUrl: text("photo_url"),
  estimatedWeightKg: real("estimated_weight_kg"),
  measuredWeightKg: real("measured_weight_kg"),
  fruitQualityScore: real("fruit_quality_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const harvestBatchesTable = pgTable("harvest_batches", {
  id: serial("id").primaryKey(),
  harvestSeasonId: integer("harvest_season_id").notNull(),
  batchCode: text("batch_code").notNull().unique(),
  groveId: integer("grove_id"),
  batchDate: text("batch_date").notNull(),
  status: text("status").notNull().default("open"),
  totalBoxes: integer("total_boxes"),
  totalEstimatedWeightKg: real("total_estimated_weight_kg"),
  totalMeasuredWeightKg: real("total_measured_weight_kg"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const harvestBatchItemsTable = pgTable("harvest_batch_items", {
  id: serial("id").primaryKey(),
  harvestBatchId: integer("harvest_batch_id").notNull(),
  harvestEventId: integer("harvest_event_id").notNull(),
  harvestBoxId: integer("harvest_box_id"),
});

export const harvestMaturitySamplesTable = pgTable("harvest_maturity_samples", {
  id: serial("id").primaryKey(),
  harvestEventId: integer("harvest_event_id").notNull(),
  sampledAt: timestamp("sampled_at").notNull().defaultNow(),
  sampledByWorkerId: integer("sampled_by_worker_id"),
  countGreen: integer("count_green").notNull().default(0),
  countYellow: integer("count_yellow").notNull().default(0),
  countPurpleStreaked: integer("count_purple_streaked").notNull().default(0),
  countPurple: integer("count_purple").notNull().default(0),
  countBlack: integer("count_black").notNull().default(0),
  totalSampled: integer("total_sampled").notNull().default(100),
  jaenScore: real("jaen_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHarvestSeasonSchema = createInsertSchema(harvestSeasonsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHarvestSeason = z.infer<typeof insertHarvestSeasonSchema>;
export type HarvestSeason = typeof harvestSeasonsTable.$inferSelect;

export const insertHarvestEventSchema = createInsertSchema(harvestEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHarvestEvent = z.infer<typeof insertHarvestEventSchema>;
export type HarvestEvent = typeof harvestEventsTable.$inferSelect;

export const insertHarvestBoxSchema = createInsertSchema(harvestBoxesTable).omit({ id: true, createdAt: true });
export type InsertHarvestBox = z.infer<typeof insertHarvestBoxSchema>;
export type HarvestBox = typeof harvestBoxesTable.$inferSelect;

export const insertHarvestBatchSchema = createInsertSchema(harvestBatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHarvestBatch = z.infer<typeof insertHarvestBatchSchema>;
export type HarvestBatch = typeof harvestBatchesTable.$inferSelect;

export const insertHarvestMaturitySampleSchema = createInsertSchema(harvestMaturitySamplesTable).omit({ id: true, createdAt: true });
export type InsertHarvestMaturitySample = z.infer<typeof insertHarvestMaturitySampleSchema>;
export type HarvestMaturitySample = typeof harvestMaturitySamplesTable.$inferSelect;
