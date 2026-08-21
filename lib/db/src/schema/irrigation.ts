import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const irrigationEventsTable = pgTable(
  "irrigation_events",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull(),
    groveId: integer("grove_id").notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    volumeLitres: real("volume_litres").notNull(),
    method: text("method").notNull(),
    durationMinutes: integer("duration_minutes"),
    photoIds: integer("photo_ids").array(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("irrigation_grove_idx").on(t.groveId),
    occurredAtIdx: index("irrigation_occurred_at_idx").on(t.occurredAt),
  }),
);

export const insertIrrigationEventSchema = createInsertSchema(irrigationEventsTable).omit({ id: true, createdAt: true });
export type InsertIrrigationEvent = z.infer<typeof insertIrrigationEventSchema>;
export type IrrigationEvent = typeof irrigationEventsTable.$inferSelect;
