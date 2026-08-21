import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trapsTable = pgTable(
  "traps",
  {
    id: serial("id").primaryKey(),
    groveId: integer("grove_id").notNull(),
    code: text("code").notNull(),
    kind: text("kind").notNull(),
    targetSpecies: text("target_species"),
    locationLat: real("location_lat"),
    locationLon: real("location_lon"),
    locationDescription: text("location_description"),
    installedAt: timestamp("installed_at").notNull().defaultNow(),
    retiredAt: timestamp("retired_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("traps_grove_idx").on(t.groveId),
  }),
);

export const trapCountsTable = pgTable(
  "trap_counts",
  {
    id: serial("id").primaryKey(),
    trapId: integer("trap_id").notNull(),
    workerId: integer("worker_id").notNull(),
    countDate: timestamp("count_date").notNull().defaultNow(),
    count: integer("count").notNull(),
    photoIds: integer("photo_ids").array(),
    source: text("source").notNull().default("manual"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    trapIdx: index("trap_counts_trap_idx").on(t.trapId),
    countDateIdx: index("trap_counts_date_idx").on(t.countDate),
  }),
);

export const insertTrapSchema = createInsertSchema(trapsTable).omit({ id: true, createdAt: true });
export const insertTrapCountSchema = createInsertSchema(trapCountsTable).omit({ id: true, createdAt: true });
export type InsertTrap = z.infer<typeof insertTrapSchema>;
export type InsertTrapCount = z.infer<typeof insertTrapCountSchema>;
export type Trap = typeof trapsTable.$inferSelect;
export type TrapCount = typeof trapCountsTable.$inferSelect;
