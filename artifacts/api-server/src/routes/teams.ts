import { Router } from "express";
import { db } from "@workspace/db";
import { teamsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";

const router = Router();

async function enrichTeam(team: any, userMap: Map<string, string>) {
  return {
    teamId: team.teamId,
    teamName: team.teamName,
    tlUserId: team.tlUserId,
    managerUserId: team.managerUserId,
    tlDisplayName: team.tlUserId ? userMap.get(team.tlUserId) ?? null : null,
    managerDisplayName: team.managerUserId ? userMap.get(team.managerUserId) ?? null : null,
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const teams = await db.select().from(teamsTable);
    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map((u) => [u.userId, u.displayName]));
    res.json(await Promise.all(teams.map(t => enrichTeam(t, userMap))));
  } catch (err) {
    req.log.error(err, "List teams error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:teamId", authenticate, async (req: AuthRequest, res) => {
  try {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.teamId, Number(req.params.teamId)));
    if (!team) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map((u) => [u.userId, u.displayName]));
    res.json(await enrichTeam(team, userMap));
  } catch (err) {
    req.log.error(err, "Get team error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:teamId", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== "Manager") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { teamName, tlUserId, managerUserId } = req.body;
    const updates: any = {};
    if (teamName !== undefined) updates.teamName = teamName;
    if (tlUserId !== undefined) updates.tlUserId = tlUserId;
    if (managerUserId !== undefined) updates.managerUserId = managerUserId;

    const [team] = await db
      .update(teamsTable)
      .set(updates)
      .where(eq(teamsTable.teamId, Number(req.params.teamId)))
      .returning();

    if (!team) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map((u) => [u.userId, u.displayName]));
    res.json(await enrichTeam(team, userMap));
  } catch (err) {
    req.log.error(err, "Update team error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
