import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const imageryAcquisitionsTable = pgTable("imagery_acquisitions", {
  id: serial("id").primaryKey(),
  imageId: text("image_id").notNull().unique(),
  provider: text("provider"),
  sensor: text("sensor"),
  productType: text("product_type"),
  acquisitionDate: text("acquisition_date").notNull(),
  resolutionM: real("resolution_m"),
  bandsAvailable: text("bands_available"),
  cloudPercent: real("cloud_percent"),
  sourceFile: text("source_file"),
  metadataJson: jsonb("metadata_json"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImageryAcquisitionSchema = createInsertSchema(imageryAcquisitionsTable).omit({ id: true, createdAt: true });
export type InsertImageryAcquisition = z.infer<typeof insertImageryAcquisitionSchema>;
export type ImageryAcquisition = typeof imageryAcquisitionsTable.$inferSelect;
