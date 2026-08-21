import { pgTable, serial, text, real, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sensorStreamsTable = pgTable(
  "sensor_streams",
  {
    id: serial("id").primaryKey(),
    name: text("name"),
    kind: text("kind").notNull(),
    attachedEntityType: text("attached_entity_type"),
    attachedEntityId: integer("attached_entity_id"),
    unit: text("unit").notNull(),
    sampleIntervalSeconds: integer("sample_interval_seconds").notNull(),
    source: text("source").notNull().default("manual"),
    calibrationJson: jsonb("calibration_jsonb"),
    status: text("status").notNull().default("active"),
    apiTokenHash: text("api_token_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("sensor_streams_kind_idx").on(t.kind),
    attachedIdx: index("sensor_streams_attached_idx").on(t.attachedEntityType, t.attachedEntityId),
  }),
);

export const sensorReadingsTable = pgTable(
  "sensor_readings",
  {
    id: serial("id").primaryKey(),
    streamId: integer("stream_id").notNull(),
    observedAt: timestamp("observed_at").notNull(),
    valueNumeric: real("value_numeric"),
    valueJson: jsonb("value_jsonb"),
    qualityFlag: text("quality_flag").notNull().default("ok"),
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (t) => ({
    streamObservedIdx: index("sensor_readings_stream_observed_idx").on(t.streamId, t.observedAt),
  }),
);

export const insertSensorStreamSchema = createInsertSchema(sensorStreamsTable).omit({
  id: true,
  createdAt: true,
  apiTokenHash: true,
  lastSeenAt: true,
});
export const insertSensorReadingSchema = createInsertSchema(sensorReadingsTable).omit({
  id: true,
  ingestedAt: true,
});

export type InsertSensorStream = z.infer<typeof insertSensorStreamSchema>;
export type InsertSensorReading = z.infer<typeof insertSensorReadingSchema>;
export type SensorStream = typeof sensorStreamsTable.$inferSelect;
export type SensorReading = typeof sensorReadingsTable.$inferSelect;
