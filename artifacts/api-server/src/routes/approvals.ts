import { Router } from "express";
import { db } from "@workspace/db";
import { approvalsTable, itemsToRateTable, usersTable, ratingsTable, tlDraftTable } from "@workspace/db/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";
import { sendEmail } from "../lib/mailer.js";
import { setRatingCycleStatus } from "../lib/rating-cycle.js";

const router = Router();

async function enrichApprovals(approvals: any[]) {
  const users = await db.select().from(usersTable);
  const items = await db.select().from(itemsToRateTable);
  const userMap = new Map(users.map((u) => [u.userId, u.displayName]));
  const itemMap = new Map(items.map((i) => [i.itemId, { name: i.itemName, category: i.category }]));

  return approvals.map((a) => ({
    approvalId: a.approvalId,
    itemId: a.itemId,
    itemName: a.itemId ? itemMap.get(a.itemId)?.name ?? null : null,
    category: a.itemId ? itemMap.get(a.itemId)?.category ?? null : null,
    teamId: a.teamId,
    ratedUserId: a.ratedUserId,
    ratedUserName: a.ratedUserId ? userMap.get(a.ratedUserId) ?? null : null,
    projectName: a.projectName ?? null,
    selfRatingValue: a.selfRatingValue ?? null,
    tlRatingValue: a.tlRatingValue,
    tlLgtmStatus: a.tlLgtmStatus,
    tlLgtmTimestamp: a.tlLgtmTimestamp?.toISOString() ?? null,
    tlLgtmByUserId: a.tlLgtmByUserId,
    finalLgtmStatus: a.finalLgtmStatus,
    finalLgtmTimestamp: a.finalLgtmTimestamp?.toISOString() ?? null,
    finalLgtmByUserId: a.finalLgtmByUserId,
    disputeStatus: a.disputeStatus,
    disputeComment: a.disputeComment,
    leadComment: a.leadComment ?? null,
    quarter: a.quarter,
    year: a.year,
    totalWeightedRating: a.totalWeightedRating ?? null,
  }));
}

function normalizeProjectName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ratingProjectKey(itemId: number, projectName?: string | null): string {
  return `${itemId}::${(projectName ?? "").trim()}`;
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

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { ratedUserId, teamId, quarter, year } = req.query as any;
    const currentUser = req.user!;

    const conditions: any[] = [];
    if (ratedUserId) conditions.push(eq(approvalsTable.ratedUserId, ratedUserId));
    if (teamId) conditions.push(eq(approvalsTable.teamId, Number(teamId)));
    if (quarter) conditions.push(eq(approvalsTable.quarter, quarter));
    if (year) conditions.push(eq(approvalsTable.year, Number(year)));

    if (currentUser.role === "User") {
      conditions.push(eq(approvalsTable.ratedUserId, currentUser.userId));
    } else if (currentUser.role === "Team Lead" && currentUser.teamId) {
      if (!teamId) conditions.push(eq(approvalsTable.teamId, currentUser.teamId));
    }

    const approvals = conditions.length > 0
      ? await db.select().from(approvalsTable).where(and(...conditions))
      : await db.select().from(approvalsTable);

    res.json(await enrichApprovals(approvals));
  } catch (err) {
    req.log.error(err, "List approvals error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/submit-user", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== "Team Lead" && currentUser.role !== "Manager") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const ratedUserId = String(req.body?.ratedUserId ?? "").trim();
    const quarter = String(req.body?.quarter ?? "").trim();
    const year = Number.parseInt(String(req.body?.year ?? ""), 10);
    const teamId = Number.parseInt(String(req.body?.teamId ?? ""), 10);

    if (!ratedUserId || !quarter || Number.isNaN(year) || Number.isNaN(teamId)) {
      res.status(400).json({ error: "ratedUserId, teamId, quarter and year are required" });
      return;
    }

    if (currentUser.role === "Team Lead") {
      if (!currentUser.teamId || currentUser.teamId !== teamId) {
        res.status(403).json({ error: "Team Lead can only submit for own team" });
        return;
      }
    }

    const [existingForPeriod] = await db
      .select({ approvalId: approvalsTable.approvalId })
      .from(approvalsTable)
      .where(
        and(
          eq(approvalsTable.ratedUserId, ratedUserId),
          eq(approvalsTable.quarter, quarter),
          eq(approvalsTable.year, year),
        ),
      )
      .limit(1);

    if (existingForPeriod) {
      res.status(409).json({
        error: "Already submitted",
        message: `Ratings already submitted for ${quarter} ${year}; re-submission is not allowed.`,
      });
      return;
    }

    const userRatings = await db
      .select()
      .from(ratingsTable)
      .where(
        and(
          eq(ratingsTable.userId, ratedUserId),
          eq(ratingsTable.quarter, quarter),
          eq(ratingsTable.year, year),
        ),
      );

    if (userRatings.length === 0) {
      res.status(400).json({ error: "No self-ratings found for this user and period" });
      return;
    }

    const activeDrafts = await db
      .select()
      .from(tlDraftTable)
      .where(
        and(
          eq(tlDraftTable.ratedUserId, ratedUserId),
          eq(tlDraftTable.quarter, quarter),
          eq(tlDraftTable.year, year),
          eq(tlDraftTable.isActive, true),
        ),
      )
      .orderBy(desc(tlDraftTable.updatedOn));

    const draftByKey = new Map<string, typeof tlDraftTable.$inferSelect>();
    for (const draft of activeDrafts) {
      const key = ratingProjectKey(draft.itemId, draft.projectName);
      if (!draftByKey.has(key)) {
        draftByKey.set(key, draft);
      }
    }

    const missingDraft = userRatings.find((rating) => {
      const key = ratingProjectKey(rating.itemId, rating.projectName);
      const draft = draftByKey.get(key);
      return !draft || draft.ratingValue == null;
    });

    if (missingDraft) {
      res.status(400).json({
        error: "Drafts required",
        message: "Save TL drafts for all rows before final submit.",
      });
      return;
    }

    let createdCount = 0;
    for (const rating of userRatings) {
      const key = ratingProjectKey(rating.itemId, rating.projectName);
      const draft = draftByKey.get(key)!;

      await db.insert(approvalsTable).values({
        itemId: rating.itemId,
        teamId,
        ratedUserId,
        projectName: rating.projectName,
        selfRatingValue: rating.ratingValue,
        tlRatingValue: draft.ratingValue,
        leadComment: draft.leadComment ?? null,
        tlLgtmStatus: "Approved",
        tlLgtmTimestamp: new Date(),
        tlLgtmByUserId: currentUser.userId,
        finalLgtmStatus: "Pending",
        disputeStatus: false,
        quarter,
        year,
      });

      await db
        .update(tlDraftTable)
        .set({ isActive: false, updatedOn: new Date() })
        .where(eq(tlDraftTable.draftId, draft.draftId));

      createdCount += 1;
    }

    await updateTotalWeightedRatingForUser({
      ratedUserId,
      teamId,
      quarter,
      year,
    });

    await setRatingCycleStatus(teamId, quarter, year, false, currentUser.userId);

    res.status(201).json({
      message: `Submitted ${createdCount} row(s) for ${quarter} ${year}`,
      count: createdCount,
    });
  } catch (err) {
    req.log.error(err, "Submit user approvals error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const { itemId, teamId, ratedUserId, tlRatingValue, quarter, year, leadComment } = req.body;
    const projectName = normalizeProjectName(req.body?.projectName);

    const activeDraftConditions: any[] = [
      eq(tlDraftTable.itemId, Number(itemId)),
      eq(tlDraftTable.ratedUserId, ratedUserId),
      eq(tlDraftTable.quarter, quarter),
      eq(tlDraftTable.year, Number(year)),
      eq(tlDraftTable.isActive, true),
    ];
    if (projectName) {
      activeDraftConditions.push(eq(tlDraftTable.projectName, projectName));
    } else {
      activeDraftConditions.push(isNull(tlDraftTable.projectName));
    }

    const [activeDraft] = await db
      .select()
      .from(tlDraftTable)
      .where(and(...activeDraftConditions))
      .orderBy(desc(tlDraftTable.updatedOn))
      .limit(1);

    if (!activeDraft || activeDraft.ratingValue === null || activeDraft.ratingValue === undefined) {
      res.status(400).json({ error: "No active TL draft found for this item and project" });
      return;
    }

    const resolvedTlRatingValue = activeDraft.ratingValue;
    const resolvedLeadComment = activeDraft.leadComment ?? leadComment ?? null;

    const selfRatingConditions: any[] = [
      eq(ratingsTable.userId, ratedUserId),
      eq(ratingsTable.itemId, itemId),
      eq(ratingsTable.quarter, quarter),
      eq(ratingsTable.year, year),
    ];
    if (projectName) {
      selfRatingConditions.push(eq(ratingsTable.projectName, projectName));
    }

    // Get the user's self-rating for this item/quarter/year
    const [selfRating] = await db
      .select()
      .from(ratingsTable)
      .where(and(...selfRatingConditions));

    const selfRatingValue = selfRating?.ratingValue ?? null;

    const existingApprovalConditions: any[] = [
      eq(approvalsTable.itemId, itemId),
      eq(approvalsTable.ratedUserId, ratedUserId),
      eq(approvalsTable.quarter, quarter),
      eq(approvalsTable.year, year),
    ];
    if (projectName) {
      existingApprovalConditions.push(eq(approvalsTable.projectName, projectName));
    }

    const [existing] = await db
      .select()
      .from(approvalsTable)
      .where(and(...existingApprovalConditions));

    let approval;
    if (existing) {
      [approval] = await db
        .update(approvalsTable)
        .set({
          projectName,
          selfRatingValue,
          tlRatingValue: resolvedTlRatingValue,
          leadComment: resolvedLeadComment,
          tlLgtmStatus: "Approved",
          tlLgtmTimestamp: new Date(),
          tlLgtmByUserId: currentUser.userId,
        })
        .where(eq(approvalsTable.approvalId, existing.approvalId))
        .returning();
    } else {
      [approval] = await db
        .insert(approvalsTable)
        .values({
          itemId,
          teamId,
          ratedUserId,
          projectName,
          selfRatingValue,
          tlRatingValue: resolvedTlRatingValue,
          leadComment: resolvedLeadComment,
          tlLgtmStatus: "Approved",
          tlLgtmTimestamp: new Date(),
          tlLgtmByUserId: currentUser.userId,
          finalLgtmStatus: "Pending",
          disputeStatus: false,
          quarter,
          year,
        })
        .returning();
    }

    await db
      .update(tlDraftTable)
      .set({
        isActive: false,
        updatedOn: new Date(),
      })
      .where(eq(tlDraftTable.draftId, activeDraft.draftId));

    // Recalculate total_weighted_rating for this user/quarter/year and update all their approval rows
    try {
      await updateTotalWeightedRatingForUser({
        ratedUserId,
        teamId: Number(teamId),
        quarter,
        year: Number(year),
      });
    } catch (weightErr) {
      req.log.warn(weightErr, "Failed to update total_weighted_rating");
    }

    // Email notification to the rated user
    const [ratedUser] = await db.select().from(usersTable).where(eq(usersTable.userId, ratedUserId));
    const [item] = await db.select().from(itemsToRateTable).where(eq(itemsToRateTable.itemId, itemId));

    if (ratedUser) {
      await sendEmail({
        to: ratedUser.email,
        subject: "Your Performance Rating Has Been Reviewed by Your Team Lead",
        text: `Dear ${ratedUser.displayName},\n\nYour Team Lead has submitted their rating for the following KPI:\n\nKPI: ${item?.itemName || "N/A"}\nYour Self-Rating: ${selfRatingValue ?? "N/A"}\nTL Rating: ${resolvedTlRatingValue}\nPeriod: ${quarter} ${year}\n\nPlease log in to the Performance Portal to view your evaluation and provide any feedback.\n\nRegards,\nPerformance Rating System`,
      });
    }

    res.status(201).json((await enrichApprovals([approval]))[0]);
  } catch (err) {
    req.log.error(err, "Create approval error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:approvalId", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const approvalId = Number(req.params.approvalId);
    const { finalLgtmStatus, tlLgtmStatus } = req.body;

    const updates: any = {};

    if (finalLgtmStatus && currentUser.role === "Manager") {
      updates.finalLgtmStatus = finalLgtmStatus;
      updates.finalLgtmTimestamp = new Date();
      updates.finalLgtmByUserId = currentUser.userId;
    }

    if (tlLgtmStatus && (currentUser.role === "Team Lead" || currentUser.role === "Manager")) {
      updates.tlLgtmStatus = tlLgtmStatus;
      updates.tlLgtmTimestamp = new Date();
      updates.tlLgtmByUserId = currentUser.userId;
    }

    const [approval] = await db
      .update(approvalsTable)
      .set(updates)
      .where(eq(approvalsTable.approvalId, approvalId))
      .returning();

    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }

    // Email notification on Final LGTM
    if (finalLgtmStatus === "Approved") {
      const [ratedUser] = await db.select().from(usersTable).where(eq(usersTable.userId, approval.ratedUserId));
      const [item] = await db.select().from(itemsToRateTable).where(eq(itemsToRateTable.itemId, approval.itemId));

      if (ratedUser) {
        await sendEmail({
          to: ratedUser.email,
          subject: "Your Performance Rating Has Received Final Approval",
          text: `Dear ${ratedUser.displayName},\n\nCongratulations! Your performance rating has been finalized by the Manager.\n\nKPI: ${item?.itemName || "N/A"}\nTL Rating: ${approval.tlRatingValue ?? "N/A"}\nPeriod: ${approval.quarter} ${approval.year}\nFinal Status: APPROVED\n\nPlease log in to the Performance Portal to view your complete evaluation summary.\n\nRegards,\nPerformance Rating System`,
        });
      }
    }

    res.json((await enrichApprovals([approval]))[0]);
  } catch (err) {
    req.log.error(err, "Update approval error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
