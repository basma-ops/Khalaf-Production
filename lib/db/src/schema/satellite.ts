import { pgTable, serial, text, real, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const treeSatelliteObservationsTable = pgTable("tree_satellite_observations", {
  id: serial("id").primaryKey(),
  treeId: integer("tree_id").notNull(),
  imageryAcquisitionId: integer("imagery_acquisition_id").notNull(),
  observationDate: text("observation_date").notNull(),
  crownAreaM2: real("crown_area_m2"),
  crownDiameterM: real("crown_diameter_m"),
  panNdviMean: real("pan_ndvi_mean"),
  panNdviMedian: real("pan_ndvi_median"),
  panNdviP10: real("pan_ndvi_p10"),
  panGndviMean: real("pan_gndvi_mean"),
  panSaviMean: real("pan_savi_mean"),
  analyticNdviMean: real("analytic_ndvi_mean"),
  analyticGndviMean: real("analytic_gndvi_mean"),
  analyticSaviMean: real("analytic_savi_mean"),
  finalNdviMean: real("final_ndvi_mean"),
  healthIndex: real("health_index"),
  canopyDensityScore: real("canopy_density_score"),
  fragmentationScore: real("fragmentation_score"),
  shadowFraction: real("shadow_fraction"),
  anomalyFlag: boolean("anomaly_flag").notNull().default(false),
  recommendedAction: text("recommended_action"),
  rawMetricsJson: jsonb("raw_metrics_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const satelliteAlertsTable = pgTable("satellite_alerts", {
  id: serial("id").primaryKey(),
  alertCode: text("alert_code").notNull(),
  alertType: text("alert_type").notNull().default("other"),
  severity: text("severity").notNull().default("low"),
  groveId: integer("grove_id").notNull(),
  treeId: integer("tree_id"),
  geometryGeojson: jsonb("geometry_geojson"),
  relatedRuleId: integer("related_rule_id"),
  evidence: text("evidence"),
  recommendedTask: text("recommended_task"),
  confidenceScore: real("confidence_score"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertSatelliteObservationSchema = createInsertSchema(treeSatelliteObservationsTable).omit({ id: true, createdAt: true });
export type InsertSatelliteObservation = z.infer<typeof insertSatelliteObservationSchema>;
export type SatelliteObservation = typeof treeSatelliteObservationsTable.$inferSelect;

export const insertSatelliteAlertSchema = createInsertSchema(satelliteAlertsTable).omit({ id: true, createdAt: true });
export type InsertSatelliteAlert = z.infer<typeof insertSatelliteAlertSchema>;
export type SatelliteAlert = typeof satelliteAlertsTable.$inferSelect;
