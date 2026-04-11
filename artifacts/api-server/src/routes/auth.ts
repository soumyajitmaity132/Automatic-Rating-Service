import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, teamsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signToken, comparePassword } from "../lib/auth.js";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Bad Request", message: "Username and password required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username));

    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    const token = signToken({
      userId: user.userId,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        teamId: user.teamId,
        teamName,
      },
    });
  } catch (err) {
    req.log.error(err, "Login error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, req.user!.userId));

    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    res.json({
      userId: user.userId,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      role: user.role,
      level: user.level,
      teamId: user.teamId,
      teamName,
    });
  } catch (err) {
    req.log.error(err, "Get me error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
