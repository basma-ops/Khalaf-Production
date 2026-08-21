import { pgTable, serial, text, real, timestamp, integer, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weatherLogTable = pgTable(
  "weather_log",
  {
    id: serial("id").primaryKey(),
    groveId: integer("grove_id").notNull(),
    observedDate: date("observed_date").notNull(),
    rainfallMm: real("rainfall_mm"),
    tempMinC: real("temp_min_c"),
    tempMaxC: real("temp_max_c"),
    humidityAvgPct: real("humidity_avg_pct"),
    leafWetnessHours: real("leaf_wetness_hours"),
    source: text("source").notNull().default("manual"),
    workerId: integer("worker_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    groveIdx: index("weather_grove_idx").on(t.groveId),
    dateIdx: index("weather_date_idx").on(t.observedDate),
    groveDateUnique: uniqueIndex("weather_grove_date_unique").on(t.groveId, t.observedDate),
  }),
);

export const insertWeatherLogSchema = createInsertSchema(weatherLogTable).omit({ id: true, createdAt: true });
export type InsertWeatherLog = z.infer<typeof insertWeatherLogSchema>;
export type WeatherLog = typeof weatherLogTable.$inferSelect;
