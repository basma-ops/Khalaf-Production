# Detection comparison report (v0_auto / v1_manual)

Counts are descriptive — the true canonical inventory is whatever the reviewer verifies. No expected total tree count is assumed.

## Headline counts

- v0_auto detections: **1272**
- v1 reviewed: **147** (10.7% coverage)
- v1 verified: **0**
- v1 rejected: **49**
- v1 manually added: **103**
- v1 uncertain: **0**
- v1 needs field check: **98**
- v1 final inventory (kept): **1326**
- v1 unresolved (still needing decisions): **1326**
- Reviewed-area precision estimate: **0.0** (verified / (verified + rejected))

## Per-grove counts

| Grove | v0 auto | v1 kept | v1 verified | v1 rejected | v1 manual | 
| --- | --- | --- | --- | --- | --- |
| ALMAFAREQ | 134 | 150 | 0 | 4 | 20 |
| AT3ET_AL_NAKHLE | 43 | 47 | 0 | 0 | 4 |
| EIN_ATEYYE | 178 | 181 | 0 | 5 | 8 |
| MENEZLEH | 38 | 39 | 0 | 1 | 2 |
| MORAN | 161 | 174 | 0 | 16 | 29 |
| ROES_ALMAL | 68 | 70 | 0 | 3 | 5 |
| SERET_AL_AJOUL_A | 381 | 401 | 0 | 13 | 33 |
| THOELIEB | 269 | 264 | 0 | 7 | 2 |

## Likely under-detection zones (algorithm missed trees)

- **MORAN**: 29 manually added
- **ALMAFAREQ**: 20 manually added
- **EIN_ATEYYE**: 8 manually added
- **SERET_AL_AJOUL_A**: 33 manually added
- **AT3ET_AL_NAKHLE**: 4 manually added
- **ROES_ALMAL**: 5 manually added

## Caveats

- Precision/recall here are *reviewer-relative*, not field-truth.
- Detections marked uncertain or needs_field_check are excluded from precision.
- Some kept trees may be fig/carob/other — they remain in the inventory, tagged by their `tree_type`.
- Imagery-only signals never claim disease, pest, age, or yield.
