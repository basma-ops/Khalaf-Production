import { pgTable, serial, text, timestamp, integer, real, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fileUrl: text("file_url").notNull(),
  caption: text("caption"),
  uploadedByUserId: integer("uploaded_by_user_id"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  // Photo Library extensions (additive, all nullable for back-compat)
  treeId: integer("tree_id"),
  groveId: integer("grove_id"),
  zone: text("zone"),
  // Cardinal face / view of the tree the photo was taken from.
  // Constrained to N|E|S|W|canopy|trunk by the OpenAPI/Zod layer; left
  // as text here so legacy rows (pre-feature) remain valid as NULL.
  photoSide: text("photo_side"),
  // What kind of report this photo represents (general | phenology | scout |
  // irrigation | treatment | weather | harvest | damage). Constrained at the
  // OpenAPI/Zod layer; left as text here so legacy rows stay valid as NULL.
  reportType: text("report_type"),
  capturedAt: timestamp("captured_at"),
  gpsLat: real("gps_lat"),
  gpsLon: real("gps_lon"),
  purpose: text("purpose"),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: integer("linked_entity_id"),
  thumbnailUrl: text("thumbnail_url"),
  originalFileName: text("original_file_name"),
  contentType: text("content_type"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  // Why the auto-link step succeeded or failed for this upload. Lets the
  // manager triage why a photo isn't bound to a tree (no GPS in EXIF vs.
  // GPS present but no tree within radius vs. EXIF parse error) without
  // having to inspect raw bytes. Nullable for legacy rows uploaded before
  // diagnostics existed. See `ingestUploadedPhoto` for the values used.
  matchStatus: text("match_status"),
});

export const auditEventsTable = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, uploadedAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
