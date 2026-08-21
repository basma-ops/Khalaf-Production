import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const grovesTable = pgTable("groves", {
  id: serial("id").primaryKey(),
  groveCode: text("grove_code").notNull().unique(),
  name: text("name").notNull(),
  boundaryGeojson: jsonb("boundary_geojson"),
  areaHa: real("area_ha"),
  centroidLat: real("centroid_lat"),
  centroidLon: real("centroid_lon"),
  notes: text("notes"),
  heritageNotes: text("heritage_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGroveSchema = createInsertSchema(grovesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGrove = z.infer<typeof insertGroveSchema>;
export type Grove = typeof grovesTable.$inferSelect;
