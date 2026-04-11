import { Router } from "express";
import { db } from "@workspace/db";
import { itemsToRateTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { authenticate, AuthRequest, requireRole } from "../middlewares/authenticate.js";

function serializeItem(i: typeof itemsToRateTable.$inferSelect) {
  return {
    itemId: i.itemId,
    itemName: i.itemName,
    description: i.description,
    level: i.level,
    teamId: i.teamId,
    weight: i.weight,
    category: i.category,
    targetRole: i.targetRole,
  };
}

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
    const targetRole = req.query.targetRole as string | undefined;
    const level = req.query.level as string | undefined;

    const conditions = [];
    if (teamId) conditions.push(eq(itemsToRateTable.teamId, teamId));
    if (targetRole) conditions.push(eq(itemsToRateTable.targetRole, targetRole));
    if (level) conditions.push(eq(itemsToRateTable.level, level));

    const items =
      conditions.length > 0
        ? await db.select().from(itemsToRateTable).where(and(...conditions))
        : await db.select().from(itemsToRateTable);

    res.json(items.map(serializeItem));
  } catch (err) {
    req.log.error(err, "List items error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const { itemName, description, level, teamId, weight, category, targetRole } = req.body;

    if (!itemName || !teamId || weight === undefined || !level) {
      res.status(400).json({ error: "itemName, teamId, weight and level are required" });
      return;
    }

    if (itemName.length > 50) {
      res.status(400).json({ error: "itemName cannot exceed 50 characters" });
      return;
    }

    if (description && description.length > 200) {
      res.status(400).json({ error: "description cannot exceed 200 characters" });
      return;
    }

    if (weight <= 0 || weight > 1) {
      res.status(400).json({ error: "weight must be between 0 and 1 (e.g. 0.55 for 55%)" });
      return;
    }

    const resolvedTargetRole =
      targetRole ?? (currentUser.role === "Manager" ? "Team Lead" : "User");

    const [item] = await db
      .insert(itemsToRateTable)
      .values({ itemName, description, level, teamId, weight, category, targetRole: resolvedTargetRole })
      .returning();

    res.status(201).json(serializeItem(item));
  } catch (err) {
    req.log.error(err, "Create item error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:itemId", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const { itemName, description, level, weight, category, targetRole } = req.body;

    if (itemName && itemName.length > 50) {
      res.status(400).json({ error: "itemName cannot exceed 50 characters" });
      return;
    }

    if (description && description.length > 200) {
      res.status(400).json({ error: "description cannot exceed 200 characters" });
      return;
    }

    const updates: any = {};
    if (itemName !== undefined) updates.itemName = itemName;
    if (description !== undefined) updates.description = description;
    if (level !== undefined) updates.level = level;
    if (weight !== undefined) updates.weight = weight;
    if (category !== undefined) updates.category = category;
    if (targetRole !== undefined) updates.targetRole = targetRole;

    const [item] = await db
      .update(itemsToRateTable)
      .set(updates)
      .where(eq(itemsToRateTable.itemId, itemId))
      .returning();

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json(serializeItem(item));
  } catch (err) {
    req.log.error(err, "Update item error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:itemId", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    const itemId = Number(req.params.itemId);

    const [deleted] = await db
      .delete(itemsToRateTable)
      .where(eq(itemsToRateTable.itemId, itemId))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    req.log.error(err, "Delete item error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
