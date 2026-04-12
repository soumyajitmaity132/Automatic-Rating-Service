import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, teamsTable, ratingsTable } from "@workspace/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { authenticate, AuthRequest, requireRole } from "../middlewares/authenticate.js";
import { sendEmail } from "../lib/mailer.js";

const router = Router();

router.get("/pending-users", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const requestedTeamId = Number.parseInt(String(req.query.teamId ?? ""), 10);
    const quarter = String(req.query.quarter ?? "").trim();
    const year = Number.parseInt(String(req.query.year ?? ""), 10);

    let teamId = requestedTeamId;
    if (Number.isNaN(teamId)) {
      teamId = currentUser.teamId ?? Number.NaN;
    }

    if (Number.isNaN(teamId) || !quarter || Number.isNaN(year)) {
      res.status(400).json({ error: "teamId, quarter and year are required" });
      return;
    }

    if (currentUser.role === "Team Lead" && currentUser.teamId && teamId !== currentUser.teamId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const members = await db
      .select({
        userId: usersTable.userId,
        displayName: usersTable.displayName,
        email: usersTable.email,
        level: usersTable.level,
      })
      .from(usersTable)
      .where(and(eq(usersTable.teamId, teamId), eq(usersTable.role, "User")));

    if (members.length === 0) {
      res.json([]);
      return;
    }

    const submittedRows = await db
      .select({ userId: ratingsTable.userId })
      .from(ratingsTable)
      .where(
        and(
          eq(ratingsTable.quarter, quarter),
          eq(ratingsTable.year, year),
          or(eq(ratingsTable.status, "submitted"), isNull(ratingsTable.status)),
        ),
      );

    const submittedUserIds = new Set(submittedRows.map((row) => row.userId));
    const pendingMembers = members.filter((member) => !submittedUserIds.has(member.userId));

    res.json(pendingMembers);
  } catch (err) {
    req.log.error(err, "List pending reminder users error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const { teamId, deadline, customMessage, userId } = req.body;
    const currentUser = req.user!;

    // Per-member notification: userId provided
    if (userId) {
      const [member] = await db.select().from(usersTable).where(eq(usersTable.userId, userId));
      if (!member) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const deadlineText = deadline ? `Please complete your ratings before: ${deadline}.` : "";
      const emailBody = customMessage
        ? `Dear ${member.displayName},\n\n${customMessage}\n\n${deadlineText}\n\nRegards,\n${currentUser.displayName}`
        : `Dear ${member.displayName},\n\nYour performance ratings for this quarter are pending.\n${deadlineText}\n\nPlease log in and complete your self-ratings at your earliest convenience.\n\nSent by: ${currentUser.displayName}`;

      await sendEmail({
        to: member.email,
        subject: "Reminder: Your Performance Ratings Are Pending",
        text: emailBody,
      });
      res.json({ message: `Reminder sent to ${member.displayName}` });
      return;
    }

    // Team-wide notification
    const targetTeamId = teamId || currentUser.teamId;
    if (!targetTeamId) {
      res.status(400).json({ error: "teamId or userId is required" });
      return;
    }

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.teamId, targetTeamId));
    const members = await db.select().from(usersTable).where(eq(usersTable.teamId, targetTeamId));

    const deadlineText = deadline ? `Please complete your ratings before: ${deadline}.` : "";
    const userMembers = members.filter(m => m.role === "User");

    for (const member of userMembers) {
      const defaultBody = `Dear ${member.displayName},\n\nYour performance ratings for this quarter are now live in the Employee Performance Portal.\n${deadlineText}\n\nPlease log in and fill out your self-ratings as soon as possible.\n\nTeam: ${team?.teamName || "Your Team"}\nSent by: ${currentUser.displayName}`;
      const emailBody = customMessage
        ? `Dear ${member.displayName},\n\n${customMessage}\n\n${deadlineText}\n\nRegards,\n${currentUser.displayName}`
        : defaultBody;

      await sendEmail({
        to: member.email,
        subject: "Action Required: Performance Ratings Are Now Live!",
        text: emailBody,
      });
    }

    res.json({ message: `Reminder sent to ${userMembers.length} team member(s)` });
  } catch (err) {
    req.log.error(err, "Send reminder error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
