import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("other"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  assignedToUserId: integer("assigned_to_user_id"),
  groveId: integer("grove_id"),
  treeId: integer("tree_id"),
  satelliteAlertId: integer("satellite_alert_id"),
  heritageRuleId: integer("heritage_rule_id"),
  dueDate: text("due_date"),
  withholdingUntil: text("withholding_until"),
  completedAt: timestamp("completed_at"),
  createdByUserId: integer("created_by_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
