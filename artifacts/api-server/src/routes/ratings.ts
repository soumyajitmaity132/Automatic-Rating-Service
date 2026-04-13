import { Router } from "express";
import { db } from "@workspace/db";
import { ratingsTable, itemsToRateTable, usersTable, teamsTable, approvalsTable, tlDraftTable } from "@workspace/db/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";
import { getRatingCycleStatus } from "../lib/rating-cycle.js";

const router = Router();

function toIsoDateString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function getPerformanceLabel(score: number): string {
  if (score > 4.5) return "Exceptional (process dependency, falls under very critical)";
  if (score >= 4.0) return "Excel Exception (critical for the process)";
  if (score >= 3.0) return "Meets Expectations (average)";
  if (score >= 2.0) return "Improvement Needed (warning and feedback should be shared)";
  return "Unsatisfactory (PIP cases, feedback should be shared immediately)";
}

function normalizeRatingStatus(value: unknown): "saved" | "pending" | "submitted" {
  if (value === "saved" || value === "pending" || value === "submitted") {
    return value;
  }

  return "pending";
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidUrl(value: string): boolean {
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalized);
    return url.hostname.length > 0 && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeArtifactLinks(value: unknown): string | null {
  const parts = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? [value]
      : [];

  const links = parts
    .flatMap((entry) => entry.split(/[\n,]+/))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter(isValidUrl);

  if (links.length === 0) {
    return null;
  }

  return Array.from(new Set(links)).join(", ");
}

router.get("/member-stages", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role === "User") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quarter = String(req.query.quarter ?? "").trim();
    const year = Number.parseInt(String(req.query.year ?? ""), 10);
    let teamId = Number.parseInt(String(req.query.teamId ?? ""), 10);

    if (!quarter || Number.isNaN(year)) {
      res.status(400).json({ error: "quarter and year are required" });
      return;
    }

    if (Number.isNaN(teamId)) {
      teamId = currentUser.teamId ?? Number.NaN;
    }

    if (Number.isNaN(teamId)) {
      res.status(400).json({ error: "teamId is required" });
      return;
    }

    if (currentUser.role === "Team Lead" && currentUser.teamId && teamId !== currentUser.teamId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const cycleOpen = await getRatingCycleStatus(teamId, quarter, year);

    const teamUsers = await db
      .select({ userId: usersTable.userId, displayName: usersTable.displayName, level: usersTable.level })
      .from(usersTable)
      .where(and(eq(usersTable.teamId, teamId), eq(usersTable.role, "User")));

    if (teamUsers.length === 0) {
      res.json([]);
      return;
    }

    const userIds = teamUsers.map((user) => user.userId);

    const ratingRows = await db
      .select({
        userId: ratingsTable.userId,
        itemId: ratingsTable.itemId,
        projectName: ratingsTable.projectName,
        status: ratingsTable.status,
      })
      .from(ratingsTable)
      .where(
        and(
          inArray(ratingsTable.userId, userIds),
          eq(ratingsTable.quarter, quarter),
          eq(ratingsTable.year, year),
        ),
      );

    const approvalRows = await db
      .select({
        ratedUserId: approvalsTable.ratedUserId,
        itemId: approvalsTable.itemId,
        projectName: approvalsTable.projectName,
        tlRatingValue: approvalsTable.tlRatingValue,
        tlLgtmStatus: approvalsTable.tlLgtmStatus,
      })
      .from(approvalsTable)
      .where(
        and(
          inArray(approvalsTable.ratedUserId, userIds),
          eq(approvalsTable.quarter, quarter),
          eq(approvalsTable.year, year),
        ),
      );

    const draftRows = await db
      .select({ ratedUserId: tlDraftTable.ratedUserId })
      .from(tlDraftTable)
      .where(
        and(
          inArray(tlDraftTable.ratedUserId, userIds),
          eq(tlDraftTable.quarter, quarter),
          eq(tlDraftTable.year, year),
        ),
      );

    const draftCountByUser = new Map<string, number>();
    for (const row of draftRows) {
      draftCountByUser.set(row.ratedUserId, (draftCountByUser.get(row.ratedUserId) ?? 0) + 1);
    }

    const stageRows = teamUsers.map((member) => {
      if (!cycleOpen) {
        return {
          userId: member.userId,
          displayName: member.displayName,
          level: member.level,
          stage: 1,
          stageLabel: "ratings not opened",
        };
      }

      const memberRatings = ratingRows.filter((row) => row.userId === member.userId);
      const submittedRatings = memberRatings.filter((row) => normalizeRatingStatus(row.status) === "submitted");
      const savedRatings = memberRatings.filter((row) => normalizeRatingStatus(row.status) !== "submitted");

      let stage = 1;
      let stageLabel = "Not Started";

      if (memberRatings.length === 0) {
        stage = 1;
        stageLabel = "Not Started";
      } else if (submittedRatings.length === 0 && savedRatings.length > 0) {
        stage = 2;
        stageLabel = "Saved";
      } else {
        const userApprovals = approvalRows.filter((row) => row.ratedUserId === member.userId);
        const hasLeadSubmitted = userApprovals.length > 0;

        if (hasLeadSubmitted) {
          stage = 5;
          stageLabel = "Lead Submit";
        } else {
          const hasTlProgress = (draftCountByUser.get(member.userId) ?? 0) > 0;
          if (hasTlProgress) {
            stage = 4;
            stageLabel = "Lead Pending";
          } else {
            stage = 3;
            stageLabel = "Submitted";
          }
        }
      }

      return {
        userId: member.userId,
        displayName: member.displayName,
        level: member.level,
        stage,
        stageLabel,
      };
    });

    res.json(stageRows);
  } catch (err) {
    req.log.error(err, "List member stages error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/summary", authenticate, async (req: AuthRequest, res) => {
  try {
    const { userId, quarter, year } = req.query as { userId: string; quarter: string; year: string };

    if (!userId || !quarter || !year) {
      res.status(400).json({ error: "userId, quarter, and year are required" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.userId, userId));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const ratings = await db
      .select({
        itemId: ratingsTable.itemId,
        itemName: itemsToRateTable.itemName,
        ratingValue: ratingsTable.ratingValue,
        category: itemsToRateTable.category,
        weight: itemsToRateTable.weight,
      })
      .from(ratingsTable)
      .leftJoin(itemsToRateTable, eq(ratingsTable.itemId, itemsToRateTable.itemId))
      .where(
        and(
          eq(ratingsTable.userId, userId),
          eq(ratingsTable.quarter, quarter),
          eq(ratingsTable.year, parseInt(year))
        )
      );

    const itemMap = new Map<number, { itemId: number; values: number[]; itemName: string; category: string; weight: number }>();
    for (const r of ratings) {
      const itemId = Number(r.itemId);
      if (!Number.isFinite(itemId)) {
        continue;
      }

      const category = r.category || "Uncategorized";
      const itemName = r.itemName || `KPI ${itemId}`;
      const weight = Number(r.weight ?? 0);
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, { itemId, values: [], itemName, category, weight });
      }

      const entry = itemMap.get(itemId)!;
      const ratingValue = Number(r.ratingValue);
      if (Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 5) {
        entry.values.push(ratingValue);
      }
    }

    const categoryScores = [];
    let weightedScore = 0;
    for (const [, itemData] of itemMap.entries()) {
      if (itemData.values.length === 0) {
        continue;
      }
      if (!Number.isFinite(itemData.weight) || itemData.weight <= 0) {
        continue;
      }

      const avgRating = itemData.values.reduce((sum, value) => sum + value, 0) / itemData.values.length;
      const weightedContribution = avgRating * itemData.weight;
      weightedScore += weightedContribution;

      categoryScores.push({
        category: itemData.itemName,
        sourceCategory: itemData.category,
        itemId: itemData.itemId,
        weight: itemData.weight,
        avgRating,
        weightedContribution,
      });
    }

    res.json({
      userId,
      displayName: user.displayName,
      quarter,
      year: parseInt(year),
      weightedScore,
      performanceLabel: getPerformanceLabel(weightedScore),
      categoryScores,
    });
  } catch (err) {
    req.log.error(err, "Get ratings summary error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { userId, quarter, year, includeDrafts } = req.query as {
      userId?: string;
      quarter?: string;
      year?: string;
      includeDrafts?: string;
    };

    const currentUser = req.user!;
    const targetUserId = userId || currentUser.userId;
    const shouldIncludeDrafts = includeDrafts === "true" && targetUserId === currentUser.userId;

    const conditions: any[] = [eq(ratingsTable.userId, targetUserId)];
    if (quarter) conditions.push(eq(ratingsTable.quarter, quarter));
    if (year) {
      const parsedYear = Number.parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        conditions.push(eq(ratingsTable.year, parsedYear));
      }
    }
    if (!shouldIncludeDrafts) {
      conditions.push(or(eq(ratingsTable.status, "submitted"), isNull(ratingsTable.status)));
    }

    const results = await db
      .select({
        ratingId: ratingsTable.ratingId,
        itemId: ratingsTable.itemId,
        itemName: itemsToRateTable.itemName,
        category: itemsToRateTable.category,
        userId: ratingsTable.userId,
        ratingValue: ratingsTable.ratingValue,
        kpiAchieved: ratingsTable.kpiAchieved,
        projectName: ratingsTable.projectName,
        quarter: ratingsTable.quarter,
        year: ratingsTable.year,
        artifactLinks: ratingsTable.artifactLinks,
        referencedTlUserId: ratingsTable.referencedTlUserId,
        status: ratingsTable.status,
        createdOn: ratingsTable.createdOn,
      })
      .from(ratingsTable)
      .leftJoin(itemsToRateTable, eq(ratingsTable.itemId, itemsToRateTable.itemId))
      .where(and(...conditions));

    res.json(
      results.map((r) => ({
        ...r,
        comment: r.kpiAchieved,
        status: r.status ?? "submitted",
        createdOn: toIsoDateString(r.createdOn),
      }))
    );
  } catch (err) {
    req.log.error(err, "List ratings error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/referable-team-leads", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role === "User") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const allLeads = await db
      .select({
        userId: usersTable.userId,
        displayName: usersTable.displayName,
        email: usersTable.email,
        level: usersTable.level,
        teamId: usersTable.teamId,
      })
      .from(usersTable)
      .where(eq(usersTable.role, "Team Lead"));

    const teams = await db.select().from(teamsTable);
    const teamNameById = new Map(teams.map((team) => [team.teamId, team.teamName]));

    const leads = allLeads
      .filter((lead) => lead.teamId != null)
      .filter((lead) => {
        if (currentUser.role === "Team Lead") {
          return lead.teamId !== currentUser.teamId;
        }
        return true;
      })
      .map((lead) => ({
        ...lead,
        teamName: lead.teamId ? teamNameById.get(lead.teamId) ?? null : null,
      }));

    res.json(leads);
  } catch (err) {
    req.log.error(err, "List referable team leads error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/referred", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role === "User") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { quarter, year } = req.query as { quarter?: string; year?: string };

    const conditions: any[] = [eq(ratingsTable.referencedTlUserId, currentUser.userId)];
    if (quarter) conditions.push(eq(ratingsTable.quarter, quarter));
    if (year) {
      const parsedYear = Number.parseInt(year, 10);
      if (!Number.isNaN(parsedYear)) {
        conditions.push(eq(ratingsTable.year, parsedYear));
      }
    }

    const rows = await db
      .select({
        ratingId: ratingsTable.ratingId,
        itemId: ratingsTable.itemId,
        itemName: itemsToRateTable.itemName,
        projectName: ratingsTable.projectName,
        userRating: ratingsTable.ratingValue,
        kpiAchieved: ratingsTable.kpiAchieved,
        artifactLinks: ratingsTable.artifactLinks,
        quarter: ratingsTable.quarter,
        year: ratingsTable.year,
        ratedUserId: usersTable.userId,
        ratedUserName: usersTable.displayName,
        ratedUserLevel: usersTable.level,
        ratedUserTeamId: usersTable.teamId,
      })
      .from(ratingsTable)
      .leftJoin(itemsToRateTable, eq(ratingsTable.itemId, itemsToRateTable.itemId))
      .leftJoin(usersTable, eq(ratingsTable.userId, usersTable.userId))
      .where(and(...conditions));

    const teams = await db.select().from(teamsTable);
    const teamNameById = new Map(teams.map((team) => [team.teamId, team.teamName]));

    res.json(rows.map((row) => ({
      ...row,
      ratedUserTeamName: row.ratedUserTeamId ? teamNameById.get(row.ratedUserTeamId) ?? null : null,
      referredByLead: "Team Lead",
    })));
  } catch (err) {
    req.log.error(err, "List referred ratings error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const { itemId, ratingValue, comment, kpiAchieved, projectName, quarter, year, artifactLinks, status } = req.body;
    const resolvedKpiAchieved = kpiAchieved ?? comment;
    const resolvedStatus = normalizeRatingStatus(status);
    const normalizedArtifactLinks = normalizeArtifactLinks(artifactLinks);

    if (!itemId || ratingValue === undefined || ratingValue === null || !quarter || !year) {
      res.status(400).json({ error: "itemId, ratingValue, quarter, year are required" });
      return;
    }

    if (currentUser.teamId) {
      const cycleOpen = await getRatingCycleStatus(currentUser.teamId, quarter, Number(year));
      if (!cycleOpen) {
        res.status(403).json({ error: `Ratings for ${quarter} ${year} have not opened yet for your team` });
        return;
      }
    }

    const numVal = parseFloat(ratingValue);
    if (isNaN(numVal) || numVal < 0.1 || numVal > 5.0) {
      res.status(400).json({ error: "ratingValue must be between 0.1 and 5.0" });
      return;
    }

    // Validate that the item exists and belongs to the user's team
    const [item] = await db
      .select()
      .from(itemsToRateTable)
      .where(eq(itemsToRateTable.itemId, itemId));

    if (!item) {
      res.status(404).json({ error: "Rating item not found" });
      return;
    }

    if (currentUser.teamId && item.teamId !== currentUser.teamId) {
      res.status(403).json({ error: "You can only rate items from your team" });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereConditions: any[] = [
      eq(ratingsTable.userId, currentUser.userId),
      eq(ratingsTable.itemId, itemId),
      eq(ratingsTable.quarter, quarter),
      eq(ratingsTable.year, year),
    ];
    if (projectName) whereConditions.push(eq(ratingsTable.projectName, projectName));

    const [existing] = await db
      .select()
      .from(ratingsTable)
      .where(and(...whereConditions));

    if (existing) {
      const [updated] = await db
        .update(ratingsTable)
        .set({
          ratingValue: numVal,
          kpiAchieved: resolvedKpiAchieved,
          projectName,
          artifactLinks: normalizedArtifactLinks,
          status: resolvedStatus,
        })
        .where(eq(ratingsTable.ratingId, existing.ratingId))
        .returning();

      res.json({ ...updated, comment: updated.kpiAchieved, status: updated.status ?? "submitted", itemName: item?.itemName ?? null, category: item?.category ?? null, createdOn: toIsoDateString(updated.createdOn) });
      return;
    }

    const [rating] = await db
      .insert(ratingsTable)
      .values({
        itemId,
        userId: currentUser.userId,
        ratingValue: numVal,
        kpiAchieved: resolvedKpiAchieved,
        projectName,
        quarter,
        year,
        artifactLinks: normalizedArtifactLinks,
        status: resolvedStatus,
      })
      .returning();

    res.status(201).json({ ...rating, comment: rating.kpiAchieved, status: rating.status ?? "submitted", itemName: item?.itemName ?? null, category: item?.category ?? null, createdOn: toIsoDateString(rating.createdOn) });
  } catch (err) {
    req.log.error(err, "Submit rating error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:ratingId/refer", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role === "User") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const ratingId = Number(req.params.ratingId);
    if (Number.isNaN(ratingId)) {
      res.status(400).json({ error: "Invalid ratingId" });
      return;
    }

    const referencedTlUserId = normalizeOptionalText(req.body?.referencedTlUserId);

    const [targetRating] = await db
      .select()
      .from(ratingsTable)
      .where(eq(ratingsTable.ratingId, ratingId));

    if (!targetRating) {
      res.status(404).json({ error: "Rating not found" });
      return;
    }

    const [ratedUser] = await db
      .select({ userId: usersTable.userId, teamId: usersTable.teamId })
      .from(usersTable)
      .where(eq(usersTable.userId, targetRating.userId));

    if (!ratedUser) {
      res.status(404).json({ error: "Rated user not found" });
      return;
    }

    const isOriginalTeamLead = currentUser.role === "Team Lead" && currentUser.teamId === ratedUser.teamId;
    const isReferredTeamLead = currentUser.role === "Team Lead" && targetRating.referencedTlUserId === currentUser.userId;

    if (currentUser.role === "Team Lead" && !isOriginalTeamLead && !isReferredTeamLead) {
      res.status(403).json({ error: "You are not allowed to update referral for this rating" });
      return;
    }

    if (isReferredTeamLead && referencedTlUserId) {
      res.status(403).json({ error: "Referred Team Lead can only send back to original Team Lead" });
      return;
    }

    if (referencedTlUserId) {
      const [targetLead] = await db
        .select({ userId: usersTable.userId, role: usersTable.role, teamId: usersTable.teamId })
        .from(usersTable)
        .where(eq(usersTable.userId, referencedTlUserId));

      if (!targetLead || targetLead.role !== "Team Lead") {
        res.status(400).json({ error: "Referenced user must be a Team Lead" });
        return;
      }

      if (targetLead.teamId == null) {
        res.status(400).json({ error: "Referenced Team Lead must belong to a team" });
        return;
      }

      if (isOriginalTeamLead && targetLead.teamId === currentUser.teamId) {
        res.status(400).json({ error: "Please refer to a Team Lead from a different team" });
        return;
      }

      if (currentUser.role === "Manager" && ratedUser.teamId != null && targetLead.teamId === ratedUser.teamId) {
        res.status(400).json({ error: "Please refer to a Team Lead from a different team" });
        return;
      }
    }

    const [updated] = await db
      .update(ratingsTable)
      .set({ referencedTlUserId: referencedTlUserId ?? null })
      .where(eq(ratingsTable.ratingId, ratingId))
      .returning({ ratingId: ratingsTable.ratingId, referencedTlUserId: ratingsTable.referencedTlUserId });

    res.json({
      message: referencedTlUserId ? "Rating referred successfully" : "Rating referral cleared",
      ...updated,
    });
  } catch (err) {
    req.log.error(err, "Refer rating error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:ratingId", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const ratingId = Number(req.params.ratingId);
    const { ratingValue, comment, artifactLinks, kpiAchieved, projectName, status } = req.body;
    const resolvedKpiAchieved = kpiAchieved ?? comment;
    const updates: Record<string, unknown> = {};

    if (ratingValue !== undefined) updates.ratingValue = ratingValue;
    if (artifactLinks !== undefined) updates.artifactLinks = normalizeArtifactLinks(artifactLinks);
    if (resolvedKpiAchieved !== undefined) updates.kpiAchieved = resolvedKpiAchieved;
    if (projectName !== undefined) updates.projectName = projectName;
    if (status !== undefined) updates.status = normalizeRatingStatus(status);

    const [existingRating] = await db
      .select()
      .from(ratingsTable)
      .where(and(eq(ratingsTable.ratingId, ratingId), eq(ratingsTable.userId, currentUser.userId)));

    if (!existingRating) {
      res.status(404).json({ error: "Rating not found" });
      return;
    }

    if (currentUser.teamId) {
      const cycleOpen = await getRatingCycleStatus(currentUser.teamId, existingRating.quarter, Number(existingRating.year));
      if (!cycleOpen) {
        res.status(403).json({ error: `Ratings for ${existingRating.quarter} ${existingRating.year} are closed for your team` });
        return;
      }
    }

    const [rating] = await db
      .update(ratingsTable)
      .set(updates)
      .where(and(eq(ratingsTable.ratingId, ratingId), eq(ratingsTable.userId, currentUser.userId)))
      .returning();

    if (!rating) {
      res.status(404).json({ error: "Rating not found" });
      return;
    }

    res.json({ ...rating, comment: rating.kpiAchieved, status: rating.status ?? "submitted", createdOn: toIsoDateString(rating.createdOn) });
  } catch (err) {
    req.log.error(err, "Update rating error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:ratingId", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const ratingId = Number(req.params.ratingId);

    const [existingRating] = await db
      .select()
      .from(ratingsTable)
      .where(and(eq(ratingsTable.ratingId, ratingId), eq(ratingsTable.userId, currentUser.userId)));

    if (!existingRating) {
      res.status(404).json({ error: "Rating not found" });
      return;
    }

    if (currentUser.teamId) {
      const cycleOpen = await getRatingCycleStatus(currentUser.teamId, existingRating.quarter, Number(existingRating.year));
      if (!cycleOpen) {
        res.status(403).json({ error: `Ratings for ${existingRating.quarter} ${existingRating.year} are closed for your team` });
        return;
      }
    }

    const [deleted] = await db
      .delete(ratingsTable)
      .where(and(eq(ratingsTable.ratingId, ratingId), eq(ratingsTable.userId, currentUser.userId)))
      .returning({ ratingId: ratingsTable.ratingId });


    res.json({ message: "Rating deleted" });
  } catch (err) {
    req.log.error(err, "Delete rating error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
