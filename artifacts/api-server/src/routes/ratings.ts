import { Router } from "express";
import { db } from "@workspace/db";
import { ratingsTable, itemsToRateTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";

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
          eq(ratingsTable.year, parseInt(year)),
          or(eq(ratingsTable.status, "submitted"), isNull(ratingsTable.status))
        )
      );

    // Build category map dynamically from DB weights
    const categoryMap = new Map<string, { total: number; count: number; weight: number }>();
    for (const r of ratings) {
      const cat = r.category || "Uncategorized";
      const weight = r.weight || 0;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { total: 0, count: 0, weight });
      }
      const entry = categoryMap.get(cat)!;
      entry.total += r.ratingValue;
      entry.count += 1;
    }

    let weightedScore = 0;
    const categoryScores = [];
    for (const [category, data] of categoryMap.entries()) {
      const avgRating = data.count > 0 ? data.total / data.count : 0;
      const weightedContribution = avgRating * data.weight;
      weightedScore += weightedContribution;
      categoryScores.push({
        category,
        weight: data.weight,
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

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const { itemId, ratingValue, comment, kpiAchieved, projectName, quarter, year, artifactLinks, status } = req.body;
    const resolvedKpiAchieved = kpiAchieved ?? comment;
    const resolvedStatus = normalizeRatingStatus(status);

    if (!itemId || ratingValue === undefined || ratingValue === null || !quarter || !year) {
      res.status(400).json({ error: "itemId, ratingValue, quarter, year are required" });
      return;
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
        .set({ ratingValue: numVal, kpiAchieved: resolvedKpiAchieved, projectName, artifactLinks, status: resolvedStatus })
        .where(eq(ratingsTable.ratingId, existing.ratingId))
        .returning();

      res.json({ ...updated, comment: updated.kpiAchieved, status: updated.status ?? "submitted", itemName: item?.itemName ?? null, category: item?.category ?? null, createdOn: toIsoDateString(updated.createdOn) });
      return;
    }

    const [rating] = await db
      .insert(ratingsTable)
      .values({ itemId, userId: currentUser.userId, ratingValue: numVal, kpiAchieved: resolvedKpiAchieved, projectName, quarter, year, artifactLinks, status: resolvedStatus })
      .returning();

    res.status(201).json({ ...rating, comment: rating.kpiAchieved, status: rating.status ?? "submitted", itemName: item?.itemName ?? null, category: item?.category ?? null, createdOn: toIsoDateString(rating.createdOn) });
  } catch (err) {
    req.log.error(err, "Submit rating error");
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
    if (artifactLinks !== undefined) updates.artifactLinks = artifactLinks;
    if (resolvedKpiAchieved !== undefined) updates.kpiAchieved = resolvedKpiAchieved;
    if (projectName !== undefined) updates.projectName = projectName;
    if (status !== undefined) updates.status = normalizeRatingStatus(status);

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

    const [deleted] = await db
      .delete(ratingsTable)
      .where(and(eq(ratingsTable.ratingId, ratingId), eq(ratingsTable.userId, currentUser.userId)))
      .returning({ ratingId: ratingsTable.ratingId });

    if (!deleted) {
      res.status(404).json({ error: "Rating not found" });
      return;
    }

    res.json({ message: "Rating deleted" });
  } catch (err) {
    req.log.error(err, "Delete rating error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
