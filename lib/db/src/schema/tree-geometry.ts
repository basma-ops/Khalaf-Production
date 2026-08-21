import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const treeGeometryRecordsTable = pgTable(
  "tree_geometry_records",
  {
    id: serial("id").primaryKey(),
    treeId: integer("tree_id").notNull(),
    workerId: integer("worker_id"),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
    trunkDiameterMm: real("trunk_diameter_mm"),
    canopyDiameterM: real("canopy_diameter_m"),
    treeHeightM: real("tree_height_m"),
    observedCrownAreaM2: real("observed_crown_area_m2"),
    photoIds: integer("photo_ids").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    treeIdx: index("tree_geom_tree_idx").on(t.treeId),
    observedAtIdx: index("tree_geom_observed_at_idx").on(t.observedAt),
  }),
);

export const insertTreeGeometryRecordSchema = createInsertSchema(treeGeometryRecordsTable).omit({ id: true, createdAt: true });
export type InsertTreeGeometryRecord = z.infer<typeof insertTreeGeometryRecordSchema>;
export type TreeGeometryRecord = typeof treeGeometryRecordsTable.$inferSelect;
