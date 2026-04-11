import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import teamsRouter from "./teams.js";
import itemsRouter from "./items.js";
import ratingsRouter from "./ratings.js";
import approvalsRouter from "./approvals.js";
import disputesRouter from "./disputes.js";
import reminderRouter from "./reminder.js";
import tlDraftsRouter from "./tl-drafts.js";
import ratingCyclesRouter from "./rating-cycles.js";

const router = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/teams", teamsRouter);
router.use("/items", itemsRouter);
router.use("/ratings", ratingsRouter);
router.use("/approvals", approvalsRouter);
router.use("/tl-drafts", tlDraftsRouter);
router.use("/rating-cycles", ratingCyclesRouter);
router.use("/disputes", disputesRouter);
router.use("/send-reminder", reminderRouter);

export default router;
