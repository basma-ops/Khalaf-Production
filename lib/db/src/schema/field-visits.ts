import { pgTable, serial, text, real, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fieldVisitsTable = pgTable("field_visits", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull(),
  taskId: integer("task_id"),
  groveId: integer("grove_id").notNull(),
  treeId: integer("tree_id"),
  satelliteAlertId: integer("satellite_alert_id"),
  visitDate: timestamp("visit_date").notNull().defaultNow(),
  gpsLat: real("gps_lat"),
  gpsLon: real("gps_lon"),
  diagnosis: text("diagnosis"),
  severity: text("severity").notNull().default("unknown"),
  treeHealthScoreField: real("tree_health_score_field"),
  canopyCondition: text("canopy_condition"),
  fruitSetScore: real("fruit_set_score"),
  droughtStressSigns: text("drought_stress_signs"),
  pestSigns: text("pest_signs"),
  pesticideOrTreatmentNeeded: boolean("pesticide_or_treatment_needed"),
  rootExposure: text("root_exposure"),
  trunkCondition: text("trunk_condition"),
  terraceCondition: text("terrace_condition"),
  understoryNotes: text("understory_notes"),
  pruningNeeded: boolean("pruning_needed"),
  actionTaken: text("action_taken"),
  followUpNeeded: boolean("follow_up_needed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFieldVisitSchema = createInsertSchema(fieldVisitsTable).omit({ id: true, createdAt: true });
export type InsertFieldVisit = z.infer<typeof insertFieldVisitSchema>;
export type FieldVisit = typeof fieldVisitsTable.$inferSelect;
