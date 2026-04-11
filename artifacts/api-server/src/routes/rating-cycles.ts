import { Router } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { approvalsTable, ratingsTable, usersTable } from "@workspace/db/schema";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";
import { getRatingCycleStatus, setRatingCycleStatus } from "../lib/rating-cycle.js";

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

async function autoSubmitTeamRatingsToApprovals(teamId: number, quarter: string, year: number) {
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
          tlLgtmStatus: "Pending",
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

    const cycle = await setRatingCycleStatus(teamId, quarter, year, isOpen, currentUser.userId);

    let autoSubmitSummary: {
      ratingsProcessed: number;
      approvalsCreated: number;
      approvalsUpdated: number;
    } | null = null;

    if (!isOpen) {
      autoSubmitSummary = await autoSubmitTeamRatingsToApprovals(teamId, quarter, year);
    }

    res.json({
      ...cycle,
      autoSubmitSummary,
    });
  } catch (err) {
    req.log.error(err, "Set rating cycle error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
