import { pgTable, serial, text, real, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pressingRunsTable = pgTable("pressing_runs", {
  id: serial("id").primaryKey(),
  harvestBatchId: integer("harvest_batch_id").notNull(),
  millName: text("mill_name"),
  pressingStartedAt: timestamp("pressing_started_at").notNull().defaultNow(),
  pressingCompletedAt: timestamp("pressing_completed_at"),
  pressingDelayHours: real("pressing_delay_hours"),
  inputOliveKg: real("input_olive_kg"),
  outputOilLiters: real("output_oil_liters"),
  oilYieldPercent: real("oil_yield_percent"),
  temperatureC: real("temperature_c"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const oilBatchesTable = pgTable("oil_batches", {
  id: serial("id").primaryKey(),
  pressingRunId: integer("pressing_run_id").notNull(),
  oilBatchCode: text("oil_batch_code").notNull().unique(),
  volumeLiters: real("volume_liters"),
  volumeRemainingLiters: real("volume_remaining_liters"),
  storageContainer: text("storage_container"),
  status: text("status").notNull().default("stored"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const labResultsTable = pgTable("lab_results", {
  id: serial("id").primaryKey(),
  attributionLevel: text("attribution_level").notNull().default("oil_batch"),
  harvestSeasonId: integer("harvest_season_id"),
  harvestBatchId: integer("harvest_batch_id"),
  pressingRunId: integer("pressing_run_id"),
  oilBatchId: integer("oil_batch_id"),
  groveId: integer("grove_id"),
  treeId: integer("tree_id"),
  batchName: text("batch_name"),
  harvestDate: text("harvest_date"),
  sampleDate: text("sample_date"),
  pressingDelayHours: real("pressing_delay_hours"),
  oliveKg: real("olive_kg"),
  oilLiters: real("oil_liters"),
  acidity: real("acidity"),
  peroxideValue: real("peroxide_value"),
  k232: real("k232"),
  k270: real("k270"),
  deltaK: real("delta_k"),
  totalPolyphenolsMgKg: real("total_polyphenols_mg_kg"),
  oleocanthal: real("oleocanthal"),
  oleacein: real("oleacein"),
  fattyAcids: text("fatty_acids"),
  labName: text("lab_name"),
  reportFileUrl: text("report_file_url"),
  reportMediaId: integer("report_media_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPressingRunSchema = createInsertSchema(pressingRunsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPressingRun = z.infer<typeof insertPressingRunSchema>;
export type PressingRun = typeof pressingRunsTable.$inferSelect;

export const insertOilBatchSchema = createInsertSchema(oilBatchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOilBatch = z.infer<typeof insertOilBatchSchema>;
export type OilBatch = typeof oilBatchesTable.$inferSelect;

export const insertLabResultSchema = createInsertSchema(labResultsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLabResult = z.infer<typeof insertLabResultSchema>;
export type LabResult = typeof labResultsTable.$inferSelect;
