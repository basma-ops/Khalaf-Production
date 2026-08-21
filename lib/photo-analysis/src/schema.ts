import { z } from "zod";

export const PHOTO_PURPOSES = [
  "general",
  "pre_harvest",
  "box",
  "pest",
  "disease",
  "damage",
  "pruning_before",
  "pruning_after",
  "growth",
] as const;
export type PhotoPurpose = (typeof PHOTO_PURPOSES)[number];

export const ANALYSIS_PROVIDERS = [
  "local_heuristic",
  "external_vision_model",
  "manual_only",
] as const;
export type AnalysisProvider = (typeof ANALYSIS_PROVIDERS)[number];

export const ANALYSIS_CONTEXTS = [
  "general_tree_review",
  "harvest_pre_tree",
  "harvest_box",
  "pest_or_disease_check",
  "pruning_assessment",
  "damage_or_anomaly",
] as const;
export type AnalysisContext = (typeof ANALYSIS_CONTEXTS)[number];

export const PEST_DISEASE_CUES = [
  "olive_fruit_fly",
  "peacock_spot",
  "verticillium_wilt",
  "olive_moth",
  "olive_knot",
  "anthracnose",
  "black_scale",
  "olive_psyllid",
  "other_unknown",
] as const;
export type PestDiseaseCue = (typeof PEST_DISEASE_CUES)[number];

export const SEVERITIES = ["none", "trace", "low", "moderate", "high", "severe", "unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TRINARY = ["yes", "no", "unclear"] as const;
export const QUAD = ["none", "low", "moderate", "high", "unclear"] as const;

export const possibleCueSchema = z.object({
  cue: z.enum(PEST_DISEASE_CUES),
  severity: z.enum(SEVERITIES),
  notes: z.string().nullable().optional(),
});

/**
 * Strict shape returned by the vision model.
 * Cautious phrasing: every field is a "possible signal", never a confirmed diagnosis.
 */
export const visionAnalysisSchema = z.object({
  imageQuality: z.enum(["excellent", "good", "fair", "poor", "unusable"]).optional(),
  canopyDensity: z.enum(["sparse", "moderate", "dense", "unclear"]).nullable().optional(),
  canopyGreennessScore: z.number().min(0).max(1).nullable().optional(),
  yellowingSignal: z.enum(QUAD).nullable().optional(),
  droughtStressVisualSignal: z.enum(QUAD).nullable().optional(),
  pruningNeedSignal: z.enum(QUAD).nullable().optional(),
  fruitMaturityVisualEstimate: z
    .enum(["green", "veraison", "ripe", "overripe", "mixed", "no_fruit_visible", "unclear"])
    .nullable()
    .optional(),
  fruitDamageSignal: z.enum(QUAD).nullable().optional(),
  understoryVisualSignal: z
    .enum(["bare", "sparse_grass", "dense_grass", "weedy", "unclear"])
    .nullable()
    .optional(),
  trunkConditionSignal: z
    .enum(["healthy_looking", "possible_damage", "possible_cavity", "lichen_present", "unclear"])
    .nullable()
    .optional(),
  rootExposureSignal: z.enum(TRINARY).nullable().optional(),
  terraceConditionSignal: z
    .enum(["intact", "minor_erosion", "major_erosion", "collapsed", "unclear", "not_visible"])
    .nullable()
    .optional(),
  possiblePestOrDiseaseCues: z.array(possibleCueSchema).default([]),
  summary: z.string(),
  limitations: z.string(),
  recommendedFollowUp: z.string().nullable().optional(),
  recommendedTaskType: z
    .enum([
      "field_verification",
      "pest_inspection",
      "disease_inspection",
      "pruning_review",
      "irrigation_check",
      "no_action_needed",
      "unclear",
    ])
    .nullable()
    .optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  needsFieldVerification: z.enum(TRINARY).default("yes"),
});
export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>;

export interface ImageQualityHeuristic {
  imageQuality: "excellent" | "good" | "fair" | "poor" | "unusable";
  blurScore: number | null;
  brightnessScore: number | null;
  widthPx: number;
  heightPx: number;
  thumbnailBuffer: Buffer;
  capturedAt: Date | null;
  gpsLat: number | null;
  gpsLon: number | null;
}
