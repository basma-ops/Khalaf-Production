import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db, mediaTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  cleanupFixtures,
  createFixtures,
  insertPendingPhoto,
  workerCookie,
  type TestFixtures,
} from "./helpers";

import app from "../src/app";

describe("POST /api/photo-library/photos/relink", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  it("rewrites pending photos to the supplied linkedEntityType/Id", async () => {
    const photoA = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit_pending",
    });
    const photoB = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit_pending",
    });
    fixtures.cleanupIds.mediaIds.push(photoA.id, photoB.id);

    const res = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({
        mediaIds: [photoA.id, photoB.id],
        linkedEntityType: "field_visit",
        linkedEntityId: 9999,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ updated: 2, requested: 2, failedIds: [] });

    const rows = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.linkedEntityId, 9999));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.linkedEntityType).toBe("field_visit");
      expect(row.linkedEntityId).toBe(9999);
    }
  });

  it("reports already-linked rows in failedIds and leaves them untouched", async () => {
    const pending = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit_pending",
    });
    const alreadyLinked = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit",
    });
    fixtures.cleanupIds.mediaIds.push(pending.id, alreadyLinked.id);
    await db
      .update(mediaTable)
      .set({ linkedEntityId: 4242 })
      .where(eq(mediaTable.id, alreadyLinked.id));

    const res = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({
        mediaIds: [pending.id, alreadyLinked.id],
        linkedEntityType: "field_visit",
        linkedEntityId: 7777,
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.requested).toBe(2);
    expect(res.body.failedIds).toEqual([alreadyLinked.id]);

    const [pendingAfter] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, pending.id));
    expect(pendingAfter?.linkedEntityType).toBe("field_visit");
    expect(pendingAfter?.linkedEntityId).toBe(7777);

    const [linkedAfter] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, alreadyLinked.id));
    expect(linkedAfter?.linkedEntityType).toBe("field_visit");
    expect(linkedAfter?.linkedEntityId).toBe(4242);
  });

  it("returns 400 for unsupported linkedEntityType (allowlist guard)", async () => {
    const photo = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit_pending",
    });
    fixtures.cleanupIds.mediaIds.push(photo.id);

    const res = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({
        mediaIds: [photo.id],
        linkedEntityType: "grove",
        linkedEntityId: 1,
      });

    expect(res.status).toBe(400);

    const [after] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, photo.id));
    expect(after?.linkedEntityType).toBe("field_visit_pending");
    expect(after?.linkedEntityId).toBeNull();
  });

  it("returns failedIds when source pending sentinel does not match the requested target type", async () => {
    // A `harvest_event_pending` row cannot be relinked to `field_visit` — the
    // source sentinel must be `field_visit_pending` for that target type.
    const wrongPending = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "harvest_event_pending",
    });
    fixtures.cleanupIds.mediaIds.push(wrongPending.id);

    const res = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({
        mediaIds: [wrongPending.id],
        linkedEntityType: "field_visit",
        linkedEntityId: 1234,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      updated: 0,
      requested: 1,
      failedIds: [wrongPending.id],
    });

    const [after] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, wrongPending.id));
    expect(after?.linkedEntityType).toBe("harvest_event_pending");
    expect(after?.linkedEntityId).toBeNull();
  });

  it("denies cross-worker relink: worker B cannot relink worker A's pending photo (IDOR guard)", async () => {
    const tag = randomBytes(3).toString("hex");
    const [otherWorker] = await db
      .insert(usersTable)
      .values({ name: `Other Worker ${tag}`, role: "field_worker", active: true })
      .returning({ id: usersTable.id });
    fixtures.cleanupIds.userIds.push(otherWorker.id);

    // Photo uploaded by the original worker.
    const photo = await insertPendingPhoto({
      workerUserId: fixtures.workerUserId,
      treeId: fixtures.treeId,
      groveId: fixtures.groveId,
      linkedEntityType: "field_visit_pending",
    });
    fixtures.cleanupIds.mediaIds.push(photo.id);

    // The other valid worker tries to relink it — request authenticates but
    // the uploaded-by guard in the WHERE clause means zero rows update.
    const res = await request(app)
      .post("/api/photo-library/photos/relink")
      .set("Cookie", workerCookie(otherWorker.id))
      .send({
        mediaIds: [photo.id],
        linkedEntityType: "field_visit",
        linkedEntityId: 5555,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      updated: 0,
      requested: 1,
      failedIds: [photo.id],
    });

    const [after] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, photo.id));
    expect(after?.linkedEntityType).toBe("field_visit_pending");
    expect(after?.linkedEntityId).toBeNull();
    expect(after?.uploadedByUserId).toBe(fixtures.workerUserId);
  });
});
