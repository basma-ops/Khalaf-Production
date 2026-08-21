# Manual review report

- Source baseline: `/Users/basmakhalaf/ReplitPrep/outputs/khalaf_baseline_20260502`
- Manual export: `outputs/khalaf_baseline_v1_manual`
- Review events processed: **200**

## Inventory state

- Auto detections: **1272**
- Reviewed: **147** (10.7% coverage)
- Verified: **0**
- Rejected: **49**
- Manually added: **103**
- Uncertain: **0**
- Needs field check: **98**
- Verified olive: **0**
- Verified fig/carob/other: **0**
- Final inventory excluding rejected: **1326**

> The true tree inventory is treated as unknown until field-verified — no expected total is enforced anywhere.

## Threshold suggestions

Global suggestions, derived from the empirical accepted-vs-rejected split. These are *suggestions*, not auto-applied — drive a `--rerun` to bake them in.
```json
{
  "n_accepted": 0,
  "n_rejected": 44,
  "min_crown_area_m2": null,
  "max_crown_area_m2": null,
  "typical_crown_diameter_m": null,
  "shadow_fraction_max_acceptable": null,
  "fragmentation_score_max_acceptable": null,
  "canopy_density_score_min_acceptable": null
}
```
Per-grove suggestions (5 groves with enough labels):
```json
{
  "ALMAFAREQ": {
    "n_accepted": 0,
    "n_rejected": 4,
    "min_crown_area_m2": null,
    "max_crown_area_m2": null,
    "typical_crown_diameter_m": null,
    "shadow_fraction_max_acceptable": null,
    "fragmentation_score_max_acceptable": null,
    "canopy_density_score_min_acceptable": null
  },
  "EIN_ATEYYE": {
    "n_accepted": 0,
    "n_rejected": 5,
    "min_crown_area_m2": null,
    "max_crown_area_m2": null,
    "typical_crown_diameter_m": null,
    "shadow_fraction_max_acceptable": null,
    "fragmentation_score_max_acceptable": null,
    "canopy_density_score_min_acceptable": null
  },
  "MORAN": {
    "n_accepted": 0,
    "n_rejected": 15,
    "min_crown_area_m2": null,
    "max_crown_area_m2": null,
    "typical_crown_diameter_m": null,
    "shadow_fraction_max_acceptable": null,
    "fragmentation_score_max_acceptable": null,
    "canopy_density_score_min_acceptable": null
  },
  "SERET_AL_AJOUL_A": {
    "n_accepted": 0,
    "n_rejected": 11,
    "min_crown_area_m2": null,
    "max_crown_area_m2": null,
    "typical_crown_diameter_m": null,
    "shadow_fraction_max_acceptable": null,
    "fragmentation_score_max_acceptable": null,
    "canopy_density_score_min_acceptable": null
  },
  "THOELIEB": {
    "n_accepted": 0,
    "n_rejected": 7,
    "min_crown_area_m2": null,
    "max_crown_area_m2": null,
    "typical_crown_diameter_m": null,
    "shadow_fraction_max_acceptable": null,
    "fragmentation_score_max_acceptable": null,
    "canopy_density_score_min_acceptable": null
  }
}
```

## False-positive patterns (rejected detections)
```json
{
  "n_rejected": 44,
  "crown_area_m2": {
    "mean": 71.347,
    "median": 20.625,
    "p10": 4.825,
    "p90": 175.45
  },
  "pan_ndvi_mean": {
    "mean": 0.336,
    "median": 0.327,
    "p10": 0.274,
    "p90": 0.388
  },
  "shadow_fraction": {
    "mean": 0.0,
    "median": 0.0,
    "p10": 0.0,
    "p90": 0.0
  },
  "fragmentation_score": {
    "mean": 0.184,
    "median": 0.183,
    "p10": 0.0,
    "p90": 0.386
  }
}
```

## Missed-tree patterns (manually added)
```json
{
  "per_grove": {
    "MORAN": 29,
    "MENEZLEH": 2,
    "ALMAFAREQ": 20,
    "EIN_ATEYYE": 8,
    "THOELIEB": 2,
    "SERET_AL_AJOUL_A": 33,
    "AT3ET_AL_NAKHLE": 4,
    "ROES_ALMAL": 5
  },
  "total_manual_added": 103
}
```

## Valid-tree classifier

_Skipped — not enough labels (need at least 30 with both classes)._
