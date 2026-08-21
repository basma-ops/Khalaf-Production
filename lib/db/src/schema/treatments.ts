import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const treatmentsTable = pgTable(
  "treatments",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull(),
    groveId: integer("grove_id").notNull(),
    treeIds: integer("tree_ids").array(),
    photoIds: integer("photo_ids").array(),
    linkedFindId: integer("linked_find_id"),
    treatmentKind: text("treatment_kind").notNull(),
    product: text("product").notNull(),
    activeIngredient: text("active_ingredient"),
    rate: real("rate"),
    rateUnit: text("rate_unit"),
    method: text("method").notNull(),
    areaHectares: real("area_hectares"),
    treesAffectedCount: integer("trees_affected_count"),
    appliedAt: timestamp("applied_at").notNull().defaultNow(),
    withholdingDays: integer("withholding_days").notNull().default(0),
    weatherConditions: text("weather_conditions"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("treatments_grove_idx").on(t.groveId),
    appliedAtIdx: index("treatments_applied_at_idx").on(t.appliedAt),
    productIdx: index("treatments_product_idx").on(t.product),
  }),
);

export const insertTreatmentSchema = createInsertSchema(treatmentsTable).omit({ id: true, createdAt: true });
export type InsertTreatment = z.infer<typeof insertTreatmentSchema>;
export type Treatment = typeof treatmentsTable.$inferSelect;
