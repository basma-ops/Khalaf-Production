import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const soilTestsTable = pgTable(
  "soil_tests",
  {
    id: serial("id").primaryKey(),
    groveId: integer("grove_id").notNull(),
    sampledAt: timestamp("sampled_at").notNull().defaultNow(),
    ph: real("ph"),
    ec: real("ec"),
    organicMatterPct: real("organic_matter_pct"),
    nitrogenPpm: real("nitrogen_ppm"),
    phosphorusPpm: real("phosphorus_ppm"),
    potassiumPpm: real("potassium_ppm"),
    labName: text("lab_name"),
    reportPhotoId: integer("report_photo_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("soil_tests_grove_idx").on(t.groveId),
    sampledAtIdx: index("soil_tests_sampled_at_idx").on(t.sampledAt),
  }),
);

export const insertSoilTestSchema = createInsertSchema(soilTestsTable).omit({ id: true, createdAt: true });
export type InsertSoilTest = z.infer<typeof insertSoilTestSchema>;
export type SoilTest = typeof soilTestsTable.$inferSelect;
