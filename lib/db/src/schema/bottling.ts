import { pgTable, serial, text, real, timestamp, integer, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { oilBatchesTable } from "./pressing";
import { treesTable } from "./trees";
import { grovesTable } from "./groves";

export const bottlingRunsTable = pgTable("bottling_runs", {
  id: serial("id").primaryKey(),
  runCode: text("run_code").notNull().unique(),
  bottledAt: text("bottled_at").notNull(),
  location: text("location"),
  format: text("format"),
  bottleSizeMl: integer("bottle_size_ml"),
  bottlesProduced: integer("bottles_produced"),
  totalLitersBottled: real("total_liters_bottled"),
  label: text("label"),
  labelTemplate: text("label_template"),
  lotCode: text("lot_code"),
  singleTree: boolean("single_tree").notNull().default(false),
  singleGrove: boolean("single_grove").notNull().default(false),
  status: text("status").notNull().default("draft"),
  qualityBasisLabResultIds: jsonb("quality_basis_lab_result_ids").$type<number[]>(),
  notes: text("notes"),
  publicToken: text("public_token").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bottlingRunOilSourcesTable = pgTable(
  "bottling_run_oil_sources",
  {
    id: serial("id").primaryKey(),
    bottlingRunId: integer("bottling_run_id")
      .notNull()
      .references(() => bottlingRunsTable.id, { onDelete: "cascade" }),
    oilBatchId: integer("oil_batch_id")
      .notNull()
      .references(() => oilBatchesTable.id, { onDelete: "restrict" }),
    litersDrawn: real("liters_drawn").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    runOilUnique: uniqueIndex("bottling_run_oil_sources_run_oil_uq").on(t.bottlingRunId, t.oilBatchId),
    runIdx: index("bottling_run_oil_sources_run_idx").on(t.bottlingRunId),
    oilIdx: index("bottling_run_oil_sources_oil_idx").on(t.oilBatchId),
  }),
);

export const bottleOriginsTable = pgTable(
  "bottle_origins",
  {
    id: serial("id").primaryKey(),
    bottlingRunId: integer("bottling_run_id")
      .notNull()
      .references(() => bottlingRunsTable.id, { onDelete: "cascade" }),
    treeId: integer("tree_id")
      .notNull()
      .references(() => treesTable.id, { onDelete: "restrict" }),
    groveId: integer("grove_id").references(() => grovesTable.id, { onDelete: "set null" }),
    contributionKg: real("contribution_kg").notNull(),
    sharePct: real("share_pct").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (t) => ({
    runTreeUnique: uniqueIndex("bottle_origins_run_tree_uq").on(t.bottlingRunId, t.treeId),
    runIdx: index("bottle_origins_run_idx").on(t.bottlingRunId),
    treeIdx: index("bottle_origins_tree_idx").on(t.treeId),
    groveIdx: index("bottle_origins_grove_idx").on(t.groveId),
  }),
);

export const insertBottlingRunSchema = createInsertSchema(bottlingRunsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBottlingRun = z.infer<typeof insertBottlingRunSchema>;
export type BottlingRun = typeof bottlingRunsTable.$inferSelect;

export const insertBottlingRunOilSourceSchema = createInsertSchema(bottlingRunOilSourcesTable).omit({ id: true, createdAt: true });
export type InsertBottlingRunOilSource = z.infer<typeof insertBottlingRunOilSourceSchema>;
export type BottlingRunOilSource = typeof bottlingRunOilSourcesTable.$inferSelect;

export const insertBottleOriginSchema = createInsertSchema(bottleOriginsTable).omit({ id: true, computedAt: true });
export type InsertBottleOrigin = z.infer<typeof insertBottleOriginSchema>;
export type BottleOrigin = typeof bottleOriginsTable.$inferSelect;
