import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, teamsTable } from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authenticate, AuthRequest, requireRole } from "../middlewares/authenticate.js";
import { hashPassword } from "../lib/auth.js";
import { randomUUID } from "crypto";

const router = Router();
const allowedRoles = new Set(["Team Lead", "Manager", "User"]);

function toUserResponse(u: typeof usersTable.$inferSelect, teamName: string | null = null) {
  return {
    userId: u.userId,
    displayName: u.displayName,
    username: u.username,
    email: u.email,
    role: u.role,
    level: u.level,
    teamId: u.teamId,
    teamName,
    ldap: u.ldap ?? null,
    process: u.process ?? null,
    vacoEmployeeCode: u.vacoEmployeeCode ?? null,
    joiningDate: u.joiningDate ?? null,
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
    const currentUser = req.user!;

    let users;
    if (currentUser.role === "Manager") {
      users = teamId
        ? await db.select().from(usersTable).where(eq(usersTable.teamId, teamId))
        : await db.select().from(usersTable);
    } else if (currentUser.role === "Team Lead") {
      if (teamId !== undefined) {
        users = await db.select().from(usersTable).where(eq(usersTable.teamId, teamId));
      } else {
        // No teamId filter: return all users (for Secondary Leads or Indirect view)
        users = await db.select().from(usersTable);
      }
    } else {
      users = await db.select().from(usersTable).where(eq(usersTable.userId, currentUser.userId));
    }

    const teams = await db.select().from(teamsTable);
    const teamMap = new Map(teams.map((t) => [t.teamId, t.teamName]));

    res.json(
      users.map((u) => toUserResponse(u, u.teamId ? teamMap.get(u.teamId) ?? null : null))
    );
  } catch (err) {
    req.log.error(err, "List users error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/register", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const { displayName, username, email, password, role, level, teamId, ldap, process, vacoEmployeeCode, joiningDate } = req.body;

    if (!displayName || !username || !email || !password) {
      res.status(400).json({ error: "displayName, username, email, and password are required" });
      return;
    }

    const allowedRole = currentUser.role === "Manager" ? "Team Lead" : "User";
    const resolvedRole = role ?? allowedRole;

    if (!allowedRoles.has(resolvedRole)) {
      res.status(400).json({ error: "role must be one of: Team Lead, Manager, User" });
      return;
    }

    if (currentUser.role === "Team Lead" && resolvedRole !== "User") {
      res.status(403).json({ error: "Team Leads can only create Users" });
      return;
    }

    const resolvedTeamId =
      currentUser.role === "Team Lead" ? currentUser.teamId : (teamId ?? null);

    const existing = await db
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    if (existing.length > 0) {
      res.status(400).json({ error: "Username already exists" });
      return;
    }

    if (ldap) {
      const existingLdap = await db
        .select({ userId: usersTable.userId })
        .from(usersTable)
        .where(eq(usersTable.ldap, ldap));

      if (existingLdap.length > 0) {
        res.status(400).json({ error: "LDAP already exists for another user" });
        return;
      }
    }

    const hashed = await hashPassword(password);
    const userId = randomUUID();

    const [user] = await db
      .insert(usersTable)
      .values({
        userId,
        displayName,
        username,
        email,
        password: hashed,
        role: resolvedRole,
        level: level ?? "L1",
        teamId: resolvedTeamId,
        ldap: ldap ?? null,
        process: process ?? null,
        vacoEmployeeCode: vacoEmployeeCode ?? null,
        joiningDate: joiningDate ?? null,
      })
      .returning();

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    res.status(201).json(toUserResponse(user, teamName));
  } catch (err) {
    req.log.error(err, "Register user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/no-leads", authenticate, requireRole("Manager"), async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;

    const [manager] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, currentUser.userId));

    if (!manager) {
      res.status(404).json({ error: "Manager not found" });
      return;
    }

    const managerProcess = manager.process?.trim() ?? null;

    const users = managerProcess
      ? await db
          .select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.role, "User"),
              isNull(usersTable.teamId),
              sql`lower(trim(${usersTable.process})) = lower(trim(${managerProcess}))`,
            ),
          )
      : await db
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.role, "User"), isNull(usersTable.teamId)));

    res.json(users.map((u) => toUserResponse(u, null)));
  } catch (err) {
    req.log.error(err, "List no-leads users error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:userId", authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId));
    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }
    res.json(toUserResponse(user, teamName));
  } catch (err) {
    req.log.error(err, "Get user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:userId", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (currentUser.role !== "Manager" && currentUser.role !== "Team Lead") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { teamId, role, displayName, username, email, level, ldap, process, vacoEmployeeCode, joiningDate } = req.body;
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (teamId !== undefined) updates.teamId = teamId;
    if (displayName !== undefined) updates.displayName = displayName;
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (level !== undefined) updates.level = level;
    if (ldap !== undefined) updates.ldap = ldap;
    if (process !== undefined) updates.process = process;
    if (vacoEmployeeCode !== undefined) updates.vacoEmployeeCode = vacoEmployeeCode;
    if (joiningDate !== undefined) updates.joiningDate = joiningDate;

    if (ldap) {
      const existingLdap = await db
        .select({ userId: usersTable.userId })
        .from(usersTable)
        .where(eq(usersTable.ldap, ldap));

      if (existingLdap.length > 0 && existingLdap[0].userId !== userId) {
        res.status(400).json({ error: "LDAP already exists for another user" });
        return;
      }
    }

    if (role !== undefined && currentUser.role === "Manager") {
      if (!allowedRoles.has(role)) {
        res.status(400).json({ error: "role must be one of: Team Lead, Manager, User" });
        return;
      }
      updates.role = role;
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.userId, userId))
      .returning();

    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    res.json(toUserResponse(user, teamName));
  } catch (err) {
    req.log.error(err, "Update user error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
