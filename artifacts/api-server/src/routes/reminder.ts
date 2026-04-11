import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, teamsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, AuthRequest, requireRole } from "../middlewares/authenticate.js";

const router = Router();

function printEmail(to: string, subject: string, body: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[EMAIL REMINDER]`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${body}`);
  console.log(`${"=".repeat(60)}\n`);
}

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

      printEmail(member.email, "Reminder: Your Performance Ratings Are Pending", emailBody);
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

      printEmail(member.email, "Action Required: Performance Ratings Are Now Live!", emailBody);
    }

    res.json({ message: `Reminder sent to ${userMembers.length} team member(s)` });
  } catch (err) {
    req.log.error(err, "Send reminder error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
