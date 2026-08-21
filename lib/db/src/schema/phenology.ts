import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const phenologyEventsTable = pgTable(
  "phenology_events",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull(),
    groveId: integer("grove_id").notNull(),
    treeId: integer("tree_id"),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
    bbchStage: text("bbch_stage").notNull(),
    bbchCode: text("bbch_code"),
    coveragePercent: real("coverage_percent"),
    intensity: text("intensity"),
    notes: text("notes"),
    photoIds: integer("photo_ids").array(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("phenology_grove_idx").on(t.groveId),
    treeIdx: index("phenology_tree_idx").on(t.treeId),
    observedAtIdx: index("phenology_observed_at_idx").on(t.observedAt),
  }),
);

export const insertPhenologyEventSchema = createInsertSchema(phenologyEventsTable).omit({ id: true, createdAt: true });
export type InsertPhenologyEvent = z.infer<typeof insertPhenologyEventSchema>;
export type PhenologyEvent = typeof phenologyEventsTable.$inferSelect;
