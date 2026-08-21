import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db, mediaTable, fieldVisitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  cleanupFixtures,
  createFixtures,
  insertPendingPhoto,
  workerCookie,
  type TestFixtures,
} from "./helpers";

import app from "../src/app";

/**
 * Integration test for the capture-first happy path used by the field-worker
 * `visit-new` page:
 *
 *   1. Worker captures one or more photos BEFORE the field visit exists.
 *      The client persists each photo with `linkedEntityType: "field_visit_pending"`.
 *   2. Worker submits the visit form -> POST /api/field-visits creates the row.
 *   3. The client then calls POST /api/photo-library/photos/relink with the
 *      newly-minted visit id, which rewrites the pending sentinels to point
 *      at the real visit.
 *
 * Asserts that after step 3 every staged photo is linked to the new visit and
 * none remain in the `*_pending` state.
 */
describe("capture-first integration: visit-new staged photos -> field visit", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  it("staged photos are linked to the new field visit after relink", async () => {
    // STEP 1 — worker captures three photos while the visit form is open.
    const stagedIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const photo = await insertPendingPhoto({
        workerUserId: fixtures.workerUserId,
        treeId: fixtures.treeId,
        groveId: fixtures.groveId,
        linkedEntityType: "field_visit_pending",
      });
      stagedIds.push(photo.id);
      fixtures.cleanupIds.mediaIds.push(photo.id);
    }

    // Sanity check: photos start in the pending sentinel state.
    const before = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.uploadedByUserId, fixtures.workerUserId));
    expect(before).toHaveLength(3);
    for (const row of before) {
      expect(row.linkedEntityType).toBe("field_visit_pending");
      expect(row.linkedEntityId).toBeNull();
    }

    // STEP 2 — worker submits the visit form. (`POST /api/field-visits`
    // does not require auth in the current contract, so no cookie is needed.)
    const visitRes = await request(app)
      .post("/api/field-visits")
      .send({
        workerId: fixtures.workerUserId,
        groveId: fixtures.groveId,
        treeId: fixtures.treeId,
        visitDate: new Date().toISOString(),
        treeHealthScoreField: 0.7,
        canopyCondition: "full_dense",
        droughtStressSigns: "none",
        pestSigns: "none",
        severity: "none",
        followUpNeeded: false,
      });
    expect(visitRes.status).toBe(201);
    const newVisitId = visitRes.body.id;
    expect(typeof newVisitId).toBe("number");
    fixtures.cleanupIds.fieldVisitIds.push(newVisitId);

    // STEP 3 — client relinks the staged photos onto the new visit.
    const relinkRes = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({
        mediaIds: stagedIds,
        linkedEntityType: "field_visit",
        linkedEntityId: newVisitId,
      });
    expect(relinkRes.status).toBe(200);
    expect(relinkRes.body).toMatchObject({
      updated: 3,
      requested: 3,
      failedIds: [],
    });

    // ASSERT — every staged photo is now linked to the new field visit and
    // none remain in the pending sentinel state.
    const after = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.linkedEntityId, newVisitId));
    expect(after).toHaveLength(3);
    for (const row of after) {
      expect(row.linkedEntityType).toBe("field_visit");
      expect(row.linkedEntityId).toBe(newVisitId);
      expect(stagedIds).toContain(row.id);
    }
    // And the field visit row exists (sanity).
    const [visit] = await db
      .select()
      .from(fieldVisitsTable)
      .where(eq(fieldVisitsTable.id, newVisitId));
    expect(visit?.workerId).toBe(fixtures.workerUserId);
    expect(visit?.treeId).toBe(fixtures.treeId);
  });
});
