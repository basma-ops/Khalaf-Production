# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run import-real-data` — wipe DB and reimport real Khalaf datasets from `attached_assets/`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Khalaf Olive Groves — Manager (Mobile)

- Artifact `artifacts/manager-mobile` (slug `manager-mobile`, base `/m/`, port 18086).
- Mobile-first companion to the desktop manager, reusing the same `/api` server and generated React Query hooks (`@workspace/api-client-react`).
- PIN gate via `MANAGER_PIN` secret + `/api/session/establish` HMAC cookie.
- Bilingual header "زيتون خلف" + "Manager Access"; serif (Times New Roman) typography on parchment cream / olive-green palette defined in `src/index.css`.
- Bottom tab nav: Overview · Alerts · Tasks · Photos · More. Secondary destinations (Groves, Trees, Weather, Oil, Sensors, Treatments, Activities, Heritage, Flags, AI) live under `/more`.

## Khalaf Olive Groves — Data & Map

- All synthetic seed data has been removed. The system uses ONLY real attached files in `attached_assets/`:
  - `groves_*.geojson` — 8 grove polygons
  - `corrected_trees_*.geojson` — 1326 trees (centroid points + crown attributes)
  - `corrected_tree_satellite_observations_*.csv` — per-tree satellite observations
  - `corrected_satellite_alerts_*.geojson` — 1234 satellite alerts
  - `Display_*.TIF` — georeferenced orthomosaic (UTM Zone 36N / EPSG:32636)
- The TIF is converted to `artifacts/api-server/public/imagery/display.jpg` (2400×1576) and served at `/api/static/imagery/display.jpg` via `express.static("public")`.
- Image WGS84 bounds are in `lib/db/src/imagery-bounds.json` and inlined in `artifacts/{manager,field}/src/components/grove-map.tsx`.
- `GroveMap` (Leaflet `L.imageOverlay` on EPSG:3857) is the shared map component used by:
  - Manager `/map` — orthomosaic with grove polygons + tree markers colored by health/alert; click to inspect.
  - Field `/visit/new` step 1 — tap-to-select grove → tap tree to start a visit.
- Image URL is the absolute `/api/static/imagery/display.jpg` so it works from both manager (`BASE_URL="/"`) and field (`BASE_URL="/field/"`) via the shared proxy.

## Auth & required env vars

The API server uses HMAC-signed HttpOnly session cookies (`khalaf_session`).
Two env vars are **required** at boot — without them the auth flows fail loudly:

- `SESSION_SECRET` — ≥16 chars; used by `artifacts/api-server/src/lib/auth.ts`
  to sign and verify the cookie. The server throws on first cookie issuance
  if missing.
- `MANAGER_PIN` — shared secret the manager UI prompts for at load
  (`artifacts/manager/src/components/manager-pin-gate.tsx`). The
  `/api/session/establish` endpoint returns **503** when unset, so the
  manager dashboard cannot mint a session and the lock screen surfaces
  the misconfiguration.

Read-endpoint matrix:

- Manager-only (require `kind === "manager"` cookie):
  `GET /photo-library/photos`, `GET /photo-library/trees/:id/timeline`,
  `GET /photo-analysis/results`, `GET /photo-analysis/results/:id`,
  `GET /photo-analysis/batches`, `GET /photo-analysis/batches/:id`,
  `GET /photo-analysis/batches/:id/export`. All review/create-task/
  link-rule POSTs are also manager-only.
- Worker-or-manager: upload flow only — `POST /photo-library/finalize-upload`
  (manager allowed only when `batchId` is set and the batch exists) and
  `POST /photo-library/photos/relink` (worker-only; ownership-gated).

## Visual Tree Intelligence + Photo Library (additive)

- **Workers are sole uploaders.** Every photo captured by a field worker is committed to the photo library before any form save (capture-first), and is auto-analyzed.
- **Cautious language only.** Every analysis result uses "possible signal" phrasing, never "confirmed". Every record includes a `limitations` field. Managers must explicitly review (`confirmed` / `rejected` / `needs_verification`) before any operational action.
- **Storage:** Replit Object Storage via signed PUT URLs. Server enriches each upload with EXIF GPS + timestamp and renders a 512px thumbnail (`sharp`).
- **Photo purposes:** `general | pre_harvest | box | pest | disease | damage | pruning_before | pruning_after | growth`.
- **DB schema (`lib/db/src/schema/`):**
  - Extended `mediaTable` with `treeId`, `groveId`, `zone`, `capturedAt`, `gpsLat`, `gpsLon`, `purpose`, `linkedEntityType`, `linkedEntityId`, `thumbnailUrl`, `originalFileName`, `contentType`, `fileSizeBytes`.
  - New tables (`photo-analysis.ts`): `photoBatchesTable`, `photoBatchItemsTable`, `photoAnalysisJobsTable`, `photoAnalysisResultsTable`.
- **Analysis lib (`lib/photo-analysis`):** providers
  - `local_heuristic` — sharp + pixel sampling for canopy density / blur / brightness.
  - `external_vision_model` — Anthropic claude-sonnet via `AI_INTEGRATIONS_ANTHROPIC_*` (Replit AI Integrations proxy). Strict JSON output validated by Zod.
  - `manual_only` — placeholder result for manual review.
- **API routes (`artifacts/api-server/src/routes/`):**
  - `storage.ts` — `POST /api/storage/upload-url`, `GET /api/storage/objects/:key`.
  - `photo-library.ts` — finalize upload, list/filter, per-tree timeline, **relink** (re-attaches staged photos to a freshly-created entity, used by capture-first flows where the parent record is created after the photos).
  - `photo-analysis.ts` — manager review queue, single result, run/re-run, review action, create-task-from-analysis, link-to-heritage-rule, batches CRUD + CSV/JSON export.
- **Manager UI (`artifacts/manager`):**
  - `/photo-analysis` — review inbox (filter by status / verification flag), per-result detail with image, signal chips, possible-cue list, limitations, confirm / reject / needs-verification, create task, link heritage rule.
  - `/photo-analysis/test` — 16-photo test page that uploads `attached_assets/*.JPG` into a fresh batch and shows live aggregates + CSV/JSON export.
  - `/photos` — estate-wide photo library, filterable by purpose.
  - `/trees/:id` — Overview + "Photos & Visual Analysis" tab + Timeline.
  - Nav links live in the new "Operations" group ("Visual Tree Intelligence" + "Photo Library").
- **Field UI (`artifacts/field`):**
  - Shared `PhotoCapture` component (`components/photo-capture.tsx`) using `<input type=file capture=environment>` for capture-first upload, then commits via `requestUploadUrl` → PUT → `finalizePhotoUpload`.
  - `task-detail.tsx` — "Add tree photo" with purpose selector.
  - `visit-new.tsx` — staged photos in the Observations step are committed immediately (with `linkedEntityType="field_visit_pending"`), then re-linked to the real `field_visit` ID via `useRelinkPhotos` after `createVisit` succeeds.
  - `harvest-active.tsx` — per-event "Add pre-harvest photo" capture.
  - `harvest-boxes.tsx` — per-box photo capture inside the Add Box form.
- **Heritage rule linking:** `POST /api/photo-analysis/results/:id/link-rule` writes a `ruleEvidenceTable` row with derived signal text — surfaced as managerial follow-up only after a `confirmed` review.

## Phase 2 — Lab, Oil Batches, Maturity Sampling, Harvest Report

- **Schema additions (`lib/db/src/schema/`):**
  - `harvest.ts` → new `harvest_maturity_samples` table: per-event olive counts by ripeness class (green/yellow/purple-streaked/purple/black) with derived `total_sampled` + `jaen_score`.
  - `pressing.ts` → `oil_batches.volume_remaining_liters`; `lab_results` extended with `attribution_level` (oil_batch | batch | tree), `sample_date`, IOC indices `k232/k270/delta_k`, `fatty_acids` JSON, `report_media_id` (linked PDF media).
- **Derived flags (server-side, never persisted):**
  - `isExtraVirgin` — acidity ≤ 0.8 % oleic acid.
  - `isHealthClaimEligible` — total polyphenols ≥ 250 mg/kg (EU 432/2012).
  - Computed in `pressing.ts::withLabFlags` and surfaced on every lab response, `/oil-batches/:id/lab-results`, and `/reports/harvest`.
- **Jaén Maturity Index** computed server-side as `(0·g + 1·y + 2·ps + 4·p + 7·b) / total`. Posting a sample also updates the parent harvest event's `fruit_maturity_score`.
- **API additions (`lib/api-spec/openapi.yaml`):**
  - `GET /oil-batches/{id}` (with `labResultCount`), `GET /oil-batches/{id}/lab-results`.
  - `GET/POST /harvest-maturity-samples` (filter by `harvestEventId`).
  - `GET /reports/harvest?seasonId=` — total kg, mean Jaén at harvest, mean pressing delay, oil yield %, per-grove + top-tree tables, lab quality flags.
  - `lab-results` list now accepts `groveId`, `treeId`, `attributionLevel` filters; responses include `groveName / treeCode / oilBatchCode` joins.
  - `FinalizeUpload.purpose` enum extended with `pdf` for lab-report attachments (linked via `linkedEntityType="lab_result"`).
- **Manager UI (`artifacts/manager`):**
  - `/lab` — list + filter by attribution level, "New lab result" dialog (incl. PDF report upload). EV / health-claim badges per row.
  - `/oil-batches` — grid + drawer with batch detail, linked lab results, and quality flags. New-batch dialog wires `pressingRunId` + status.
  - `/reports/harvest` — KPI strip + per-grove table + top-trees table + lab-flag list. Season switcher.
  - Sidebar "Harvest" group gained `Lab Results`, `Oil Batches`, `Harvest Report` links.
- **Field UI (`artifacts/field`):**
  - `/harvest/:id/maturity` — large-touch ripeness counter with live Jaén readout, 50-olive minimum guard, and "Skip" path that returns to the boxes screen. Linked from each Active Harvest card via "Maturity sample (Jaén)".
- **Photo wiring audit:** `pre_harvest` (Active Harvests card) and `box` (Add Box form) capture flows confirmed end-to-end through `PhotoCapture` → presigned PUT → `finalizePhotoUpload`.

## Phase 3 — Bottling Runs & Bottle ↔ Tree Traceability

- **Schema (`lib/db/src/schema/bottling.ts`):** `bottling_runs` (run_code, bottled_at, label, lot_code, bottle_size_ml, bottles_produced, total_liters_bottled), `bottling_run_oil_sources` (FK→oil_batch, liters_drawn — drives volume_remaining decrement), and materialized `bottle_origins` (per bottling-run × tree contribution_kg + share_pct).
- **API (`/bottling-runs` CRUD, manager-gated):** `PUT /bottling-runs/:id/sources` validates against oil-batch remaining (oversubscription → 400), restores prior allocations on replace, then recomputes `bottle_origins` by walking each oil source → pressing_run → harvest_batch → batch_items → harvest_events/boxes and prorating litersDrawn by per-tree weight share. `DELETE` restores the volume too.
- **Trace endpoints:** `GET /trees/:id/bottling-runs` (joins `bottle_origins` for per-tree share + estimated bottles), `GET /reports/lot-trace/:bottlingRunId` (full run → oil sources → pressing/mill/batch chain → grove rollup → tree origins + lab results with EVOO/health-claim flags).
- **Manager UI:** `/bottling` list + new dialog, `/bottling/:id` editor (details + source allocator + tree-origin table), `/reports/lot-trace/:id` printable trace report. Tree Detail page gained a **Bottles** tab listing all bottling runs containing the tree's oil with share% and est. bottles. Sidebar "Harvest" group has a new Wine icon → "Bottling Runs".
- **Tests (`artifacts/api-server/tests/bottling.test.ts`):** auth gating (401/403), allocation correctness (60/40 weight split → exact 60.0%/40.0% origin shares), oversubscription rejection, and delete-restores-remaining behavior — all 5 passing.
