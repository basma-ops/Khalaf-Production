import { pgTable, serial, text, real, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const treesTable = pgTable("trees", {
  id: serial("id").primaryKey(),
  treeCode: text("tree_code").notNull().unique(),
  groveId: integer("grove_id").notNull(),
  treeType: text("tree_type").notNull().default("unknown"),
  variety: text("variety").notNull().default("unknown"),
  ancientStatus: text("ancient_status").notNull().default("unknown"),
  estimatedAgeClass: text("estimated_age_class"),
  centroidLat: real("centroid_lat"),
  centroidLon: real("centroid_lon"),
  pointGeojson: jsonb("point_geojson"),
  crownGeojson: jsonb("crown_geojson"),
  crownAreaM2: real("crown_area_m2"),
  crownDiameterM: real("crown_diameter_m"),
  currentHealthIndex: real("current_health_index"),
  currentAlertStatus: text("current_alert_status").notNull().default("unknown"),
  verificationStatus: text("verification_status").notNull().default("satellite_detected"),
  fieldTag: text("field_tag"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTreeSchema = createInsertSchema(treesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTree = z.infer<typeof insertTreeSchema>;
export type Tree = typeof treesTable.$inferSelect;
