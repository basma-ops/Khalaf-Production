import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const managerFlagsTable = pgTable(
  "manager_flags",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    flagType: text("flag_type").notNull(),
    severity: text("severity").notNull().default("info"),
    status: text("status").notNull().default("open"),
    message: text("message").notNull(),
    createdByUserId: integer("created_by_user_id"),
    assignedToUserId: integer("assigned_to_user_id"),
    resolvedByUserId: integer("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at"),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("manager_flags_entity_idx").on(t.entityType, t.entityId),
    statusIdx: index("manager_flags_status_idx").on(t.status),
  }),
);

export const managerFlagEventsTable = pgTable(
  "manager_flag_events",
  {
    id: serial("id").primaryKey(),
    flagId: integer("flag_id").notNull(),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: integer("actor_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    flagIdx: index("manager_flag_events_flag_idx").on(t.flagId),
  }),
);

export const insertManagerFlagSchema = createInsertSchema(managerFlagsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManagerFlag = z.infer<typeof insertManagerFlagSchema>;
export type ManagerFlag = typeof managerFlagsTable.$inferSelect;

export const insertManagerFlagEventSchema = createInsertSchema(managerFlagEventsTable).omit({ id: true, createdAt: true });
export type InsertManagerFlagEvent = z.infer<typeof insertManagerFlagEventSchema>;
export type ManagerFlagEvent = typeof managerFlagEventsTable.$inferSelect;
