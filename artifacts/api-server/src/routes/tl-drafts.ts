import { Router } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { itemsToRateTable, tlDraftTable, usersTable } from "@workspace/db/schema";
import { authenticate, AuthRequest } from "../middlewares/authenticate.js";

const router = Router();

function normalizeProjectName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function enrichDrafts(drafts: any[]) {
	const leadIds = Array.from(
		new Set(
			drafts
				.map((draft) => draft.teamLeadUserId)
				.filter((value): value is string => typeof value === "string" && value.length > 0),
		),
	);
	const itemIds = Array.from(
		new Set(
			drafts
				.map((draft) => draft.itemId)
				.filter((value): value is number => typeof value === "number"),
		),
	);

	const leads = leadIds.length > 0
		? await db
				.select({ userId: usersTable.userId, displayName: usersTable.displayName })
				.from(usersTable)
				.where(inArray(usersTable.userId, leadIds))
		: [];

	const items = itemIds.length > 0
		? await db
				.select({ itemId: itemsToRateTable.itemId, itemName: itemsToRateTable.itemName })
				.from(itemsToRateTable)
				.where(inArray(itemsToRateTable.itemId, itemIds))
		: [];

	const leadMap = new Map(leads.map((lead) => [lead.userId, lead.displayName]));
	const itemMap = new Map(items.map((item) => [item.itemId, item.itemName]));

	return drafts.map((draft) => ({
		draftId: draft.draftId,
		ratingValue: draft.ratingValue ?? null,
		itemId: draft.itemId,
		itemName: itemMap.get(draft.itemId) ?? null,
		projectName: draft.projectName ?? null,
		ratedUserId: draft.ratedUserId,
		teamLeadUserId: draft.teamLeadUserId,
		teamLeadDisplayName: draft.teamLeadUserId ? leadMap.get(draft.teamLeadUserId) ?? null : null,
		leadComment: draft.leadComment ?? null,
		quarter: draft.quarter,
		year: draft.year,
		isActive: draft.isActive,
		updatedOn: draft.updatedOn?.toISOString() ?? null,
	}));
}

router.get("/", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		if (currentUser.role === "User") {
			res.status(403).json({ error: "Forbidden" });
			return;
		}

		const { ratedUserId, quarter, year, itemId, projectName: rawProjectName, includeInactive } = req.query as any;
		const projectName = normalizeProjectName(rawProjectName);
		if (!ratedUserId || !quarter || !year) {
			res.status(400).json({ error: "ratedUserId, quarter and year are required" });
			return;
		}

		const conditions: any[] = [
			eq(tlDraftTable.ratedUserId, ratedUserId),
			eq(tlDraftTable.quarter, quarter),
			eq(tlDraftTable.year, Number(year)),
		];

		if (includeInactive !== "true") {
			conditions.push(eq(tlDraftTable.isActive, true));
		}

		if (itemId) {
			conditions.push(eq(tlDraftTable.itemId, Number(itemId)));
		}

		if (projectName) {
			conditions.push(eq(tlDraftTable.projectName, projectName));
		} else if (rawProjectName === "") {
			conditions.push(isNull(tlDraftTable.projectName));
		}

		const drafts = await db
			.select()
			.from(tlDraftTable)
			.where(and(...conditions))
			.orderBy(desc(tlDraftTable.updatedOn));

		res.json(await enrichDrafts(drafts));
	} catch (err) {
		req.log.error(err, "List TL drafts error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

router.post("/", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		if (currentUser.role === "User") {
			res.status(403).json({ error: "Forbidden" });
			return;
		}

		const { itemId, ratedUserId, ratingValue, quarter, year, leadComment } = req.body;
		const projectName = normalizeProjectName(req.body?.projectName);

		if (!itemId || !ratedUserId || !quarter || !year) {
			res.status(400).json({ error: "itemId, ratedUserId, quarter and year are required" });
			return;
		}

		if (ratingValue === null || ratingValue === undefined || Number.isNaN(Number(ratingValue))) {
			res.status(400).json({ error: "A valid ratingValue is required" });
			return;
		}

		const matchConditions: any[] = [
			eq(tlDraftTable.itemId, Number(itemId)),
			eq(tlDraftTable.ratedUserId, ratedUserId),
			eq(tlDraftTable.quarter, quarter),
			eq(tlDraftTable.year, Number(year)),
		];

		if (projectName) {
			matchConditions.push(eq(tlDraftTable.projectName, projectName));
		} else {
			matchConditions.push(isNull(tlDraftTable.projectName));
		}

		await db
			.update(tlDraftTable)
			.set({
				isActive: false,
				updatedOn: new Date(),
			})
			.where(and(...matchConditions));

		const [savedDraft] = await db
			.insert(tlDraftTable)
			.values({
				itemId: Number(itemId),
				projectName,
				ratedUserId,
				teamLeadUserId: currentUser.userId,
				ratingValue: Number(ratingValue),
				leadComment: typeof leadComment === "string" ? leadComment : null,
				quarter,
				year: Number(year),
				isActive: true,
				updatedOn: new Date(),
			})
			.returning();

		res.status(201).json((await enrichDrafts([savedDraft]))[0]);
	} catch (err) {
		req.log.error(err, "Save TL draft error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

export default router;
