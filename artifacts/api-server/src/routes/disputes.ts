import { Router } from "express";
import { db } from "@workspace/db";
import { approvalsTable, itemsToRateTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";

const router = Router();

async function enrichApprovals(approvals: any[]) {
  const users = await db.select().from(usersTable);
  const items = await db.select().from(itemsToRateTable);
  const userMap = new Map(users.map((u) => [u.userId, u.displayName]));
  const itemMap = new Map(items.map((i) => [i.itemId, i.itemName]));

  return approvals.map((a) => ({
    approvalId: a.approvalId,
    itemId: a.itemId,
    itemName: a.itemId ? itemMap.get(a.itemId) ?? null : null,
    teamId: a.teamId,
    ratedUserId: a.ratedUserId,
    ratedUserName: a.ratedUserId ? userMap.get(a.ratedUserId) ?? null : null,
    tlRatingValue: a.tlRatingValue,
    tlLgtmStatus: a.tlLgtmStatus,
    tlLgtmTimestamp: a.tlLgtmTimestamp?.toISOString() ?? null,
    tlLgtmByUserId: a.tlLgtmByUserId,
    finalLgtmStatus: a.finalLgtmStatus,
    finalLgtmTimestamp: a.finalLgtmTimestamp?.toISOString() ?? null,
    finalLgtmByUserId: a.finalLgtmByUserId,
    disputeStatus: a.disputeStatus,
    disputeComment: a.disputeComment,
    quarter: a.quarter,
    year: a.year,
  }));
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.query as any;
    const currentUser = req.user!;

    const conditions: any[] = [eq(approvalsTable.disputeStatus, true)];

    if (currentUser.role === "User") {
      conditions.push(eq(approvalsTable.ratedUserId, currentUser.userId));
    } else if (currentUser.role === "Team Lead" && currentUser.teamId) {
      if (teamId) {
        conditions.push(eq(approvalsTable.teamId, Number(teamId)));
      } else {
        conditions.push(eq(approvalsTable.teamId, currentUser.teamId));
      }
    }

    const approvals = await db
      .select()
      .from(approvalsTable)
      .where(and(...conditions));

    res.json(await enrichApprovals(approvals));
  } catch (err) {
    req.log.error(err, "List disputes error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:approvalId", authenticate, async (req: AuthRequest, res) => {
  try {
    const approvalId = Number(req.params.approvalId);
    const { disputeComment } = req.body;

    if (!disputeComment) {
      res.status(400).json({ error: "disputeComment is required" });
      return;
    }

    const [approval] = await db
      .update(approvalsTable)
      .set({ disputeStatus: true, disputeComment })
      .where(eq(approvalsTable.approvalId, approvalId))
      .returning();

    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }

    res.json((await enrichApprovals([approval]))[0]);
  } catch (err) {
    req.log.error(err, "Raise dispute error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/:approvalId", authenticate, async (req: AuthRequest, res) => {
  try {
    const approvalId = Number(req.params.approvalId);
    const { resolution, comment } = req.body;
    const currentUser = req.user!;

    const updates: any = { disputeStatus: false };

    if (currentUser.role === "Manager") {
      updates.finalLgtmStatus = resolution;
      updates.finalLgtmTimestamp = new Date();
      updates.finalLgtmByUserId = currentUser.userId;
    } else if (currentUser.role === "Team Lead") {
      updates.tlLgtmStatus = resolution;
      updates.tlLgtmTimestamp = new Date();
      updates.tlLgtmByUserId = currentUser.userId;
    }

    if (comment) {
      updates.disputeComment = comment;
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

    res.json((await enrichApprovals([approval]))[0]);
  } catch (err) {
    req.log.error(err, "Resolve dispute error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
