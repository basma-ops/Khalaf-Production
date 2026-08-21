import { pgTable, serial, text, real, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activitiesTable = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    workerId: integer("worker_id").notNull(),
    groveId: integer("grove_id").notNull(),
    treeIds: integer("tree_ids").array(),
    photoIds: integer("photo_ids").array(),
    taskId: integer("task_id"),
    activityType: text("activity_type").notNull(),
    performedAt: timestamp("performed_at").notNull().defaultNow(),
    durationMinutes: integer("duration_minutes"),
    treesAffectedCount: integer("trees_affected_count"),
    areaHectares: real("area_hectares"),
    materialsUsed: text("materials_used"),
    gpsLat: real("gps_lat"),
    gpsLon: real("gps_lon"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("activities_grove_idx").on(t.groveId),
    performedAtIdx: index("activities_performed_at_idx").on(t.performedAt),
    workerIdx: index("activities_worker_idx").on(t.workerId),
  }),
);

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
