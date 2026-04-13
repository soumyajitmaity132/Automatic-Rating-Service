import { Router } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { approvalsTable, ratingsTable, usersTable, teamsTable, itemsToRateTable } from "@workspace/db/schema";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";
import { getRatingCycleStatus, setRatingCycleStatus } from "../lib/rating-cycle.js";
import { sendEmail } from "../lib/mailer.js";

const router = Router();

function normalizeProjectName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function approvalKey(entry: {
  itemId: number;
  ratedUserId: string;
  quarter: string | null;
  year: number | null;
  projectName: string | null;
}): string {
  return `${entry.itemId}::${entry.ratedUserId}::${entry.quarter ?? ""}::${entry.year ?? ""}::${entry.projectName ?? ""}`;
}

async function updateTotalWeightedRatingForUser(params: {
  ratedUserId: string;
  teamId: number;
  quarter: string;
  year: number;
}) {
  const allUserApprovals = await db
    .select()
    .from(approvalsTable)
    .where(
      and(
        eq(approvalsTable.ratedUserId, params.ratedUserId),
        eq(approvalsTable.teamId, params.teamId),
        eq(approvalsTable.quarter, params.quarter),
        eq(approvalsTable.year, params.year),
      )
    );

  if (allUserApprovals.length === 0) {
    return null;
  }

  const teamItems = await db
    .select()
    .from(itemsToRateTable)
    .where(eq(itemsToRateTable.teamId, params.teamId));

  const itemRatings: Record<number, number[]> = {};
  for (const approval of allUserApprovals) {
    const effectiveRating = approval.tlRatingValue ?? approval.selfRatingValue;
    if (effectiveRating !== null && effectiveRating !== undefined) {
      if (!itemRatings[approval.itemId]) itemRatings[approval.itemId] = [];
      itemRatings[approval.itemId].push(Number(effectiveRating));
    }
  }

  let weightedSum = 0;
  let hasAny = false;
  for (const item of teamItems) {
    const weight = Number(item.weight ?? 0);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const values = itemRatings[item.itemId];
    if (!values || values.length === 0) continue;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    weightedSum += weight * average;
    hasAny = true;
  }

  const finalWeightedRating = hasAny ? weightedSum : null;

  await db
    .update(approvalsTable)
    .set({ totalWeightedRating: finalWeightedRating })
    .where(
      and(
        eq(approvalsTable.ratedUserId, params.ratedUserId),
        eq(approvalsTable.teamId, params.teamId),
        eq(approvalsTable.quarter, params.quarter),
        eq(approvalsTable.year, params.year),
      )
    );

  return finalWeightedRating;
}

async function getInvalidKpiWeightLevels(teamId: number): Promise<string[]> {
  const rows = await db
    .select({ level: itemsToRateTable.level, weight: itemsToRateTable.weight })
    .from(itemsToRateTable)
    .where(and(eq(itemsToRateTable.teamId, teamId), eq(itemsToRateTable.targetRole, "User")));

  const totalsByLevel = new Map<string, number>([
    ["L1", 0],
    ["L2", 0],
    ["L3", 0],
  ]);

  for (const row of rows) {
    const level = String(row.level ?? "").toUpperCase();
    if (!totalsByLevel.has(level)) {
      continue;
    }

    const weight = Number(row.weight ?? 0);
    if (Number.isFinite(weight)) {
      totalsByLevel.set(level, (totalsByLevel.get(level) ?? 0) + weight);
    }
  }

  const tolerance = 0.005;
  const invalidLevels: string[] = [];

  for (const level of ["L1", "L2", "L3"]) {
    const total = totalsByLevel.get(level) ?? 0;
    if (Math.abs(total - 1) > tolerance) {
      invalidLevels.push(level);
    }
  }

  return invalidLevels;
}

async function autoSubmitTeamRatingsToApprovals(teamId: number, quarter: string, year: number, submittedByUserId: string) {
  const teamUsers = await db
    .select({ userId: usersTable.userId })
    .from(usersTable)
    .where(and(eq(usersTable.teamId, teamId), eq(usersTable.role, "User")));

  const userIds = teamUsers.map((entry) => entry.userId);
  if (userIds.length === 0) {
    return { ratingsProcessed: 0, approvalsCreated: 0, approvalsUpdated: 0 };
  }

  const ratings = await db
    .select()
    .from(ratingsTable)
    .where(
      and(
        inArray(ratingsTable.userId, userIds),
        eq(ratingsTable.quarter, quarter),
        eq(ratingsTable.year, year),
      ),
    );

  if (ratings.length === 0) {
    return { ratingsProcessed: 0, approvalsCreated: 0, approvalsUpdated: 0 };
  }

  const existingApprovals = await db
    .select()
    .from(approvalsTable)
    .where(
      and(
        eq(approvalsTable.teamId, teamId),
        inArray(approvalsTable.ratedUserId, userIds),
        eq(approvalsTable.quarter, quarter),
        eq(approvalsTable.year, year),
      ),
    );

  const existingByKey = new Map(existingApprovals.map((approval) => [
    approvalKey({
      itemId: approval.itemId,
      ratedUserId: approval.ratedUserId,
      quarter: approval.quarter,
      year: approval.year,
      projectName: approval.projectName,
    }),
    approval,
  ]));

  let approvalsCreated = 0;
  let approvalsUpdated = 0;

  for (const rating of ratings) {
    const key = approvalKey({
      itemId: rating.itemId,
      ratedUserId: rating.userId,
      quarter: rating.quarter,
      year: rating.year,
      projectName: rating.projectName,
    });

    const existing = existingByKey.get(key);
    if (existing) {
      await db
        .update(approvalsTable)
        .set({
          selfRatingValue: rating.ratingValue,
          projectName: rating.projectName,
          quarter: rating.quarter,
          year: rating.year,
          tlLgtmStatus: "Approved",
          tlLgtmTimestamp: new Date(),
          tlLgtmByUserId: submittedByUserId,
        })
        .where(eq(approvalsTable.approvalId, existing.approvalId));
      approvalsUpdated += 1;
    } else {
      await db
        .insert(approvalsTable)
        .values({
          itemId: rating.itemId,
          teamId,
          ratedUserId: rating.userId,
          projectName: rating.projectName,
          selfRatingValue: rating.ratingValue,
          tlRatingValue: null,
          tlLgtmStatus: "Approved",
          tlLgtmTimestamp: new Date(),
          tlLgtmByUserId: submittedByUserId,
          finalLgtmStatus: "Pending",
          disputeStatus: false,
          quarter: rating.quarter,
          year: rating.year,
        });
      approvalsCreated += 1;
    }

    const updateConditions: any[] = [
      eq(ratingsTable.ratingId, rating.ratingId),
    ];

    await db
      .update(ratingsTable)
      .set({ status: "submitted" })
      .where(and(...updateConditions));
  }

  for (const userId of userIds) {
    await updateTotalWeightedRatingForUser({
      ratedUserId: userId,
      teamId,
      quarter,
      year,
    });
  }

  return {
    ratingsProcessed: ratings.length,
    approvalsCreated,
    approvalsUpdated,
  };
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const quarter = String(req.query.quarter ?? "").trim();
    const year = Number.parseInt(String(req.query.year ?? ""), 10);

    if (!quarter || Number.isNaN(year)) {
      res.status(400).json({ error: "quarter and year are required" });
      return;
    }

    let teamId = Number.parseInt(String(req.query.teamId ?? ""), 10);
    if (Number.isNaN(teamId)) {
      if (!currentUser.teamId) {
        res.status(400).json({ error: "teamId is required" });
        return;
      }
      teamId = currentUser.teamId;
    }

    if (currentUser.role === "Team Lead" && currentUser.teamId && teamId !== currentUser.teamId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (currentUser.role === "User" && currentUser.teamId && teamId !== currentUser.teamId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const isOpen = await getRatingCycleStatus(teamId, quarter, year);
    res.json({ teamId, quarter, year, isOpen });
  } catch (err) {
    req.log.error(err, "Get rating cycle error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== "Team Lead" && currentUser.role !== "Manager") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quarter = String(req.body?.quarter ?? "").trim();
    const year = Number.parseInt(String(req.body?.year ?? ""), 10);
    const requestedTeamId = Number.parseInt(String(req.body?.teamId ?? ""), 10);
    const isOpen = !!req.body?.isOpen;

    if (!quarter || Number.isNaN(year)) {
      res.status(400).json({ error: "teamId, quarter, year and isOpen are required" });
      return;
    }

    let teamId = requestedTeamId;
    if (Number.isNaN(teamId)) {
      teamId = currentUser.teamId ?? NaN;
    }

    if (Number.isNaN(teamId)) {
      res.status(400).json({ error: "teamId is required" });
      return;
    }

    if (currentUser.role === "Team Lead") {
      if (!currentUser.teamId || teamId !== currentUser.teamId) {
        res.status(403).json({ error: "Team Lead can only update their own team cycle" });
        return;
      }
    }

    if (isOpen) {
      const [existingApprovedSubmission] = await db
        .select({ approvalId: approvalsTable.approvalId })
        .from(approvalsTable)
        .where(
          and(
            eq(approvalsTable.teamId, teamId),
            eq(approvalsTable.quarter, quarter),
            eq(approvalsTable.year, year),
            eq(approvalsTable.tlLgtmStatus, "Approved"),
          )
        )
        .limit(1);

      if (existingApprovedSubmission) {
        res.status(400).json({
          error: `Ratings for ${quarter} ${year} have already been submitted for your team and cannot be reopened.`,
        });
        return;
      }

      const invalidLevels = await getInvalidKpiWeightLevels(teamId);
      if (invalidLevels.length > 0) {
        res.status(400).json({
          error: `Manage your KPI weightage. Total KPI weight must be 100% for each level (L1/L2/L3). Please fix: ${invalidLevels.join(", ")}.`,
        });
        return;
      }
    }

    const cycle = await setRatingCycleStatus(teamId, quarter, year, isOpen, currentUser.userId);

    let autoSubmitSummary: {
      ratingsProcessed: number;
      approvalsCreated: number;
      approvalsUpdated: number;
    } | null = null;

    if (!isOpen) {
      autoSubmitSummary = await autoSubmitTeamRatingsToApprovals(teamId, quarter, year, currentUser.userId);
    }

    let notificationSummary: {
      attempted: number;
      sent: number;
      failed: number;
    } | null = null;

    // Send notification emails to all team members (Users only, not Team Leads)
    try {
      const teamMembers = await db
        .select({ userId: usersTable.userId, displayName: usersTable.displayName, email: usersTable.email })
        .from(usersTable)
        .where(and(eq(usersTable.teamId, teamId), eq(usersTable.role, "User")));

      notificationSummary = {
        attempted: teamMembers.length,
        sent: 0,
        failed: 0,
      };

      if (teamMembers.length > 0) {
        const [team] = await db
          .select({ teamName: teamsTable.teamName })
          .from(teamsTable)
          .where(eq(teamsTable.teamId, teamId));

        const teamName = team?.teamName ?? "Your Team";
        const subject = isOpen
          ? `Ratings are now open for ${quarter} ${year}`
          : `Ratings have closed for ${quarter} ${year}`;

        for (const member of teamMembers) {
          const email = String(member.email ?? "").trim();
          if (!email) {
            notificationSummary.failed += 1;
            req.log.warn({ userId: member.userId }, "Skipping cycle notification email: missing recipient email");
            continue;
          }

          const emailBody = isOpen
            ? `Dear ${member.displayName},\n\nRatings are now open for ${quarter} ${year} in the Employee Performance Portal.\n\nPlease log in and complete your self-ratings at your earliest convenience.\n\nTeam: ${teamName}\n\nRegards,\nEmployee Performance Team`
            : `Dear ${member.displayName},\n\nRatings submission has closed for ${quarter} ${year}. All submitted ratings will now be processed for manager review.\n\nTeam: ${teamName}\n\nRegards,\nEmployee Performance Team`;

          try {
            await sendEmail({
              to: email,
              subject,
              text: emailBody,
            });
            notificationSummary.sent += 1;
          } catch (err) {
            notificationSummary.failed += 1;
            req.log.error({ userId: member.userId, email, err }, "Failed to send cycle notification email");
          }
        }
      }
    } catch (emailErr) {
      req.log.error(emailErr, "Error sending cycle notification emails");
      // Don't fail the request if email sending fails
    }

    res.json({
      ...cycle,
      autoSubmitSummary,
      notificationSummary,
    });
  } catch (err) {
    req.log.error(err, "Set rating cycle error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
