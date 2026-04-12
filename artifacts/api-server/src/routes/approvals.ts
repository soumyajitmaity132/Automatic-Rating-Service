import { Router } from "express";
import { db } from "@workspace/db";
import { approvalsTable, itemsToRateTable, usersTable, ratingsTable, tlDraftTable } from "@workspace/db/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";
import { sendEmail } from "../lib/mailer.js";

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
      const allUserApprovals = await db
        .select()
        .from(approvalsTable)
        .where(
          and(
            eq(approvalsTable.ratedUserId, ratedUserId),
            eq(approvalsTable.quarter, quarter),
            eq(approvalsTable.year, Number(year))
          )
        );

      const teamItems = await db
        .select()
        .from(itemsToRateTable)
        .where(eq(itemsToRateTable.teamId, Number(teamId)));

      // Group tlRatingValues by itemId to compute per-item average
      const itemRatings: Record<number, number[]> = {};
      for (const a of allUserApprovals) {
        if (a.tlRatingValue !== null && a.tlRatingValue !== undefined) {
          if (!itemRatings[a.itemId]) itemRatings[a.itemId] = [];
          itemRatings[a.itemId].push(a.tlRatingValue);
        }
      }

      // weighted sum across all items that have at least one TL rating
      let weightedSum = 0;
      let hasAny = false;
      for (const item of teamItems) {
        const w = Number(item.weight ?? 0);
        if (!Number.isFinite(w) || w <= 0) continue;
        const vals = itemRatings[item.itemId];
        if (!vals || vals.length === 0) continue;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        weightedSum += w * avg;
        hasAny = true;
      }

      if (hasAny) {
        const approvalIds = allUserApprovals.map((a) => a.approvalId);
        await db
          .update(approvalsTable)
          .set({ totalWeightedRating: weightedSum })
          .where(inArray(approvalsTable.approvalId, approvalIds));
      }
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
