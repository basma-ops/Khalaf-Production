import { randomUUID, randomBytes } from "node:crypto";
import {
  db,
  usersTable,
  grovesTable,
  treesTable,
  mediaTable,
  photoAnalysisJobsTable,
  photoAnalysisResultsTable,
  heritageRulesTable,
  fieldVisitsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// Ensure required env vars are present BEFORE importing app.ts (auth.ts reads
// SESSION_SECRET lazily on each request, but we set a fallback here so tests
// can run in environments where the secret has not been provisioned yet).
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  process.env.SESSION_SECRET = "test-session-secret-do-not-use-in-prod-0123456789";
}
if (!process.env.MANAGER_PIN || process.env.MANAGER_PIN.length < 4) {
  process.env.MANAGER_PIN = "test-pin-1234";
}

// Resolve the auth helper after env vars are set.
import { signSession, SESSION_COOKIE } from "../src/lib/auth";

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export interface TestFixtures {
  workerUserId: number;
  managerUserId: number;
  groveId: number;
  treeId: number;
  cleanupIds: {
    mediaIds: number[];
    fieldVisitIds: number[];
    heritageRuleIds: number[];
    treeIds: number[];
    groveIds: number[];
    userIds: number[];
  };
}

/**
 * Create a fully isolated set of fixtures (worker, manager, grove, tree)
 * with random suffixes so concurrent test files don't collide.
 *
 * Returns a `cleanupIds` bag that the test must pass back to `cleanupFixtures`
 * in `afterAll` to delete every row it created in dependency order.
 */
export async function createFixtures(): Promise<TestFixtures> {
  const tag = randomBytes(4).toString("hex");

  const [worker] = await db
    .insert(usersTable)
    .values({
      name: `Test Worker ${tag}`,
      role: "field_worker",
      active: true,
    })
    .returning({ id: usersTable.id });

  const [manager] = await db
    .insert(usersTable)
    .values({
      name: `Test Manager ${tag}`,
      role: "manager",
      active: true,
    })
    .returning({ id: usersTable.id });

  const [grove] = await db
    .insert(grovesTable)
    .values({
      groveCode: `TEST-G-${tag}`,
      name: `Test Grove ${tag}`,
    })
    .returning({ id: grovesTable.id });

  const [tree] = await db
    .insert(treesTable)
    .values({
      treeCode: `TEST-T-${tag}`,
      groveId: grove.id,
      treeType: "olive",
      variety: "souri",
    })
    .returning({ id: treesTable.id });

  return {
    workerUserId: worker.id,
    managerUserId: manager.id,
    groveId: grove.id,
    treeId: tree.id,
    cleanupIds: {
      mediaIds: [],
      fieldVisitIds: [],
      heritageRuleIds: [],
      treeIds: [tree.id],
      groveIds: [grove.id],
      userIds: [worker.id, manager.id],
    },
  };
}

/**
 * Delete fixtures in dependency order. Safe to call repeatedly; missing rows
 * are simply no-ops.
 */
export async function cleanupFixtures(fixtures: TestFixtures): Promise<void> {
  const { cleanupIds } = fixtures;
  if (cleanupIds.mediaIds.length > 0) {
    // Photo analysis results / jobs reference media; remove them first.
    await db
      .delete(photoAnalysisResultsTable)
      .where(inArray(photoAnalysisResultsTable.mediaId, cleanupIds.mediaIds));
    await db
      .delete(photoAnalysisJobsTable)
      .where(inArray(photoAnalysisJobsTable.mediaId, cleanupIds.mediaIds));
    await db.delete(mediaTable).where(inArray(mediaTable.id, cleanupIds.mediaIds));
  }
  if (cleanupIds.fieldVisitIds.length > 0) {
    await db
      .delete(fieldVisitsTable)
      .where(inArray(fieldVisitsTable.id, cleanupIds.fieldVisitIds));
  }
  if (cleanupIds.heritageRuleIds.length > 0) {
    await db
      .delete(heritageRulesTable)
      .where(inArray(heritageRulesTable.id, cleanupIds.heritageRuleIds));
  }
  if (cleanupIds.treeIds.length > 0) {
    await db.delete(treesTable).where(inArray(treesTable.id, cleanupIds.treeIds));
  }
  if (cleanupIds.groveIds.length > 0) {
    await db.delete(grovesTable).where(inArray(grovesTable.id, cleanupIds.groveIds));
  }
  if (cleanupIds.userIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, cleanupIds.userIds));
  }
}

/** Build the `Cookie` header value for a worker session. */
export function workerCookie(userId: number): string {
  return `${SESSION_COOKIE_NAME}=${signSession(`worker:${userId}`)}`;
}

/** Build the `Cookie` header value for the manager session. */
export function managerCookie(): string {
  return `${SESSION_COOKIE_NAME}=${signSession("manager")}`;
}

export interface InsertPendingPhotoArgs {
  workerUserId: number;
  treeId: number;
  groveId: number;
  linkedEntityType: string;
  uploadedByUserId?: number;
}

/**
 * Insert a `mediaTable` row directly so tests don't need to round-trip through
 * object-storage / sharp / EXIF. Mirrors what `finalize-upload` would write
 * for a "capture-first" photo: a `*_pending` linkedEntityType, no
 * linkedEntityId, the worker as uploader.
 */
export async function insertPendingPhoto(
  args: InsertPendingPhotoArgs,
): Promise<{ id: number }> {
  const objectId = randomUUID();
  const [row] = await db
    .insert(mediaTable)
    .values({
      entityType: "library",
      entityId: 0,
      fileUrl: `/objects/uploads/${objectId}`,
      uploadedByUserId: args.uploadedByUserId ?? args.workerUserId,
      treeId: args.treeId,
      groveId: args.groveId,
      purpose: "general",
      linkedEntityType: args.linkedEntityType,
      linkedEntityId: null,
      originalFileName: `test-${objectId}.jpg`,
      contentType: "image/jpeg",
      fileSizeBytes: 1024,
    })
    .returning({ id: mediaTable.id });
  return row;
}

export async function insertHeritageRule(tag: string): Promise<{ id: number }> {
  const suffix = randomBytes(3).toString("hex");
  const [row] = await db
    .insert(heritageRulesTable)
    .values({
      ruleCode: `TEST-R-${tag}-${suffix}`,
      name: `Test Heritage Rule ${tag} ${suffix}`,
      status: "hypothesis",
    })
    .returning({ id: heritageRulesTable.id });
  return row;
}

/**
 * Manually insert a photo_analysis_results row with full control over
 * `reviewStatus`. Used by the link-rule tests since they need to verify the
 * 409 guard against non-confirmed reviews.
 */
export async function insertAnalysisResult(args: {
  mediaId: number;
  treeId: number | null;
  groveId: number | null;
  reviewStatus: string;
  confidenceScore?: number | null;
  summary?: string | null;
}): Promise<{ id: number; jobId: number }> {
  const [job] = await db
    .insert(photoAnalysisJobsTable)
    .values({
      mediaId: args.mediaId,
      provider: "local_heuristic",
      context: "general_tree_review",
      status: "succeeded",
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: photoAnalysisJobsTable.id });

  const [result] = await db
    .insert(photoAnalysisResultsTable)
    .values({
      jobId: job.id,
      mediaId: args.mediaId,
      treeId: args.treeId,
      groveId: args.groveId,
      provider: "local_heuristic",
      context: "general_tree_review",
      reviewStatus: args.reviewStatus,
      confidenceScore: args.confidenceScore ?? 0.8,
      summary: args.summary ?? "Test summary for analysis result.",
      possiblePestOrDiseaseCues: [],
    })
    .returning({ id: photoAnalysisResultsTable.id });

  return { id: result.id, jobId: job.id };
}
