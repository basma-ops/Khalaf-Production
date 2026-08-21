import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pestDiseaseFindsTable = pgTable(
  "pest_disease_finds",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull(),
    groveId: integer("grove_id").notNull(),
    treeId: integer("tree_id"),
    speciesCode: text("species_code").notNull(),
    severity: text("severity").notNull(),
    percentAffected: real("percent_affected"),
    recommendedAction: text("recommended_action"),
    notes: text("notes"),
    photoIds: integer("photo_ids").array(),
    linkedTreatmentId: integer("linked_treatment_id"),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("pest_finds_grove_idx").on(t.groveId),
    treeIdx: index("pest_finds_tree_idx").on(t.treeId),
    speciesIdx: index("pest_finds_species_idx").on(t.speciesCode),
    observedAtIdx: index("pest_finds_observed_at_idx").on(t.observedAt),
  }),
);

export const insertPestDiseaseFindSchema = createInsertSchema(pestDiseaseFindsTable).omit({ id: true, createdAt: true });
export type InsertPestDiseaseFind = z.infer<typeof insertPestDiseaseFindSchema>;
export type PestDiseaseFind = typeof pestDiseaseFindsTable.$inferSelect;
