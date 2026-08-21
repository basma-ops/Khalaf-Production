import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, like, and, SQL } from "drizzle-orm";
import {
  ListUsersQueryParams,
  CreateUserBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
} from "@workspace/api-zod";


const router: IRouter = Router();

router.get("/users", async (req, res) => {
  const query = ListUsersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { role, active } = query.data;
  const conditions: SQL[] = [];
  if (role) conditions.push(eq(usersTable.role, role));
  if (active !== undefined) conditions.push(eq(usersTable.active, active));
  const users = await db.select().from(usersTable).where(conditions.length ? and(...conditions) : undefined);
  res.json(users);
});

router.post("/users", async (req, res) => {
  const body = CreateUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [user] = await db.insert(usersTable).values(body.data).returning();
  res.status(201).json(user);
});

router.get("/users/:id", async (req, res) => {
  const params = GetUserParams.safeParse({ id: Number(req.params["id"]) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});

router.patch("/users/:id", async (req, res) => {
  const params = UpdateUserParams.safeParse({ id: Number(req.params["id"]) });
  const body = UpdateUserBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [updated] = await db.update(usersTable).set(body.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
