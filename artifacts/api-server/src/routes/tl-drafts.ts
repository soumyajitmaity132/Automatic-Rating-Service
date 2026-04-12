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
		userDisputeMessage: draft.userDisputeMessage ?? null,
		status: draft.status ?? "saved",
		quarter: draft.quarter,
		year: draft.year,
		isActive: draft.isActive,
		updatedOn: draft.updatedOn?.toISOString() ?? null,
	}));
}

router.post("/raise-dispute", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		if (currentUser.role !== "User") {
			res.status(403).json({ error: "Forbidden" });
			return;
		}

		const draftId = Number.parseInt(String(req.body?.draftId ?? ""), 10);
		const message = String(req.body?.message ?? "").trim();

		if (Number.isNaN(draftId) || !message) {
			res.status(400).json({ error: "draftId and message are required" });
			return;
		}

		const [draft] = await db
			.select()
			.from(tlDraftTable)
			.where(eq(tlDraftTable.draftId, draftId));

		if (!draft) {
			res.status(404).json({ error: "Draft not found" });
			return;
		}

		if (draft.ratedUserId !== currentUser.userId) {
			res.status(403).json({ error: "You can only raise disputes for your own feedback" });
			return;
		}

		if (!draft.isActive) {
			res.status(400).json({ error: "This draft is no longer active" });
			return;
		}

		if (draft.status !== "send_to_user" && draft.status !== "dispute raised") {
			res.status(400).json({ error: "Dispute can be raised only on sent feedback" });
			return;
		}

		const [updated] = await db
			.update(tlDraftTable)
			.set({
				status: "dispute raised",
				userDisputeMessage: message,
				updatedOn: new Date(),
			})
			.where(eq(tlDraftTable.draftId, draftId))
			.returning();

		res.json((await enrichDrafts([updated]))[0]);
	} catch (err) {
		req.log.error(err, "Raise user dispute error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

router.post("/fix-dispute", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		if (currentUser.role === "User") {
			res.status(403).json({ error: "Forbidden" });
			return;
		}

		const draftId = Number.parseInt(String(req.body?.draftId ?? ""), 10);
		if (Number.isNaN(draftId)) {
			res.status(400).json({ error: "draftId is required" });
			return;
		}

		const [draft] = await db
			.select()
			.from(tlDraftTable)
			.where(eq(tlDraftTable.draftId, draftId));

		if (!draft) {
			res.status(404).json({ error: "Draft not found" });
			return;
		}

		if (!draft.isActive) {
			res.status(400).json({ error: "This draft is no longer active" });
			return;
		}

		if (draft.status !== "dispute raised") {
			res.status(400).json({ error: "Only dispute raised drafts can be marked as fixed" });
			return;
		}

		const [updated] = await db
			.update(tlDraftTable)
			.set({
				status: "dispute fixed",
				updatedOn: new Date(),
			})
			.where(eq(tlDraftTable.draftId, draftId))
			.returning();

		res.json((await enrichDrafts([updated]))[0]);
	} catch (err) {
		req.log.error(err, "Fix dispute error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

router.get("/sent-feedback", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		const quarter = String(req.query.quarter ?? "").trim();
		const year = Number.parseInt(String(req.query.year ?? ""), 10);

		if (!quarter || Number.isNaN(year)) {
			res.status(400).json({ error: "quarter and year are required" });
			return;
		}

		const conditions: any[] = [
			eq(tlDraftTable.quarter, quarter),
			eq(tlDraftTable.year, year),
			eq(tlDraftTable.isActive, true),
			inArray(tlDraftTable.status, ["send_to_user", "dispute raised", "dispute fixed"]),
		];

		if (currentUser.role === "User") {
			conditions.push(eq(tlDraftTable.ratedUserId, currentUser.userId));
		} else {
			const ratedUserId = String(req.query.ratedUserId ?? "").trim();
			if (!ratedUserId) {
				res.status(400).json({ error: "ratedUserId is required" });
				return;
			}
			conditions.push(eq(tlDraftTable.ratedUserId, ratedUserId));
		}

		const drafts = await db
			.select()
			.from(tlDraftTable)
			.where(and(...conditions))
			.orderBy(desc(tlDraftTable.updatedOn));

		res.json(await enrichDrafts(drafts));
	} catch (err) {
		req.log.error(err, "List sent TL feedback error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

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
				status: "saved",
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

router.post("/send-to-user", authenticate, async (req: AuthRequest, res) => {
	try {
		const currentUser = req.user!;
		if (currentUser.role === "User") {
			res.status(403).json({ error: "Forbidden" });
			return;
		}

		const ratedUserId = String(req.body?.ratedUserId ?? "").trim();
		const quarter = String(req.body?.quarter ?? "").trim();
		const year = Number.parseInt(String(req.body?.year ?? ""), 10);

		if (!ratedUserId || !quarter || Number.isNaN(year)) {
			res.status(400).json({ error: "ratedUserId, quarter and year are required" });
			return;
		}

		if (currentUser.role === "Team Lead") {
			const [ratedUser] = await db
				.select({ teamId: usersTable.teamId })
				.from(usersTable)
				.where(eq(usersTable.userId, ratedUserId));

			if (!ratedUser || ratedUser.teamId == null || currentUser.teamId !== ratedUser.teamId) {
				res.status(403).json({ error: "Team Lead can only send drafts to own team members" });
				return;
			}
		}

		const activeSavedDrafts = await db
			.select({ draftId: tlDraftTable.draftId })
			.from(tlDraftTable)
			.where(
				and(
					eq(tlDraftTable.ratedUserId, ratedUserId),
					eq(tlDraftTable.quarter, quarter),
					eq(tlDraftTable.year, year),
					eq(tlDraftTable.isActive, true),
					eq(tlDraftTable.status, "saved"),
				),
			);

		if (activeSavedDrafts.length === 0) {
			res.status(400).json({ error: "No saved drafts available to send" });
			return;
		}

		for (const draft of activeSavedDrafts) {
			await db
				.update(tlDraftTable)
				.set({ status: "send_to_user", updatedOn: new Date() })
				.where(eq(tlDraftTable.draftId, draft.draftId));
		}

		res.json({ message: `Sent ${activeSavedDrafts.length} draft(s) to user`, count: activeSavedDrafts.length });
	} catch (err) {
		req.log.error(err, "Send drafts to user error");
		res.status(500).json({ error: "Internal Server Error" });
	}
});

export default router;
