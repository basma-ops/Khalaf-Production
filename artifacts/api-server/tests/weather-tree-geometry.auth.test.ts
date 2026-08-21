import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  cleanupFixtures,
  createFixtures,
  workerCookie,
  managerCookie,
  type TestFixtures,
} from "./helpers";
import app from "../src/app";

describe("weather-log + tree-geometry-records auth gating", () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  it("rejects unauthenticated POST /weather-log", async () => {
    const res = await request(app)
      .post("/api/weather-log")
      .send({ groveId: fixtures.groveId, observedDate: "2026-04-01", rainfallMm: 1 });
    expect(res.status).toBe(401);
  });

  it("allows worker POST /weather-log and creates the row", async () => {
    const res = await request(app)
      .post("/api/weather-log")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({ groveId: fixtures.groveId, observedDate: "2026-04-02", rainfallMm: 2.5, source: "manual" });
    expect(res.status).toBe(201);
    expect(res.body.groveId).toBe(fixtures.groveId);
  });

  it("rejects worker PATCH /weather-log/:id (manager-only)", async () => {
    const created = await request(app)
      .post("/api/weather-log")
      .set("Cookie", managerCookie())
      .send({ groveId: fixtures.groveId, observedDate: "2026-04-03", rainfallMm: 3 });
    expect(created.status).toBe(201);
    const id = created.body.id as number;

    const wRes = await request(app)
      .patch(`/api/weather-log/${id}`)
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({ rainfallMm: 9 });
    expect(wRes.status).toBe(403);

    const mRes = await request(app)
      .patch(`/api/weather-log/${id}`)
      .set("Cookie", managerCookie())
      .send({ rainfallMm: 9 });
    expect(mRes.status).toBe(200);
    expect(mRes.body.rainfallMm).toBe(9);
  });

  it("rejects unauthenticated POST /tree-geometry-records", async () => {
    const res = await request(app)
      .post("/api/tree-geometry-records")
      .send({ treeId: fixtures.treeId, canopyDiameterM: 3.2, treeHeightM: 4.1 });
    expect(res.status).toBe(401);
  });

  it("allows worker POST /tree-geometry-records and rejects worker DELETE", async () => {
    const created = await request(app)
      .post("/api/tree-geometry-records")
      .set("Cookie", workerCookie(fixtures.workerUserId))
      .send({ treeId: fixtures.treeId, canopyDiameterM: 3.2, treeHeightM: 4.1 });
    expect(created.status).toBe(201);
    const id = created.body.id as number;

    const wDel = await request(app)
      .delete(`/api/tree-geometry-records/${id}`)
      .set("Cookie", workerCookie(fixtures.workerUserId));
    expect(wDel.status).toBe(403);

    const mDel = await request(app)
      .delete(`/api/tree-geometry-records/${id}`)
      .set("Cookie", managerCookie());
    expect(mDel.status).toBe(204);
  });
});
