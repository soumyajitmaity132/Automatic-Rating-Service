import { pgTable, serial, integer, text, real, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsToRateTable } from "./items";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const approvalsTable = pgTable("approvals", {
  approvalId: serial("approval_id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => itemsToRateTable.itemId),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.teamId),
  ratedUserId: text("rated_user_id")
    .notNull()
    .references(() => usersTable.userId),
  projectName: varchar("project_name", { length: 255 }),
  selfRatingValue: real("self_rating_value"),
  tlRatingValue: real("tl_rating_value"),
  tlLgtmStatus: text("tl_lgtm_status").notNull().default("Pending"),
  tlLgtmTimestamp: timestamp("tl_lgtm_timestamp"),
  tlLgtmByUserId: text("tl_lgtm_by_user_id").references(() => usersTable.userId),
  finalLgtmStatus: text("final_lgtm_status").notNull().default("Pending"),
  finalLgtmTimestamp: timestamp("final_lgtm_timestamp"),
  finalLgtmByUserId: text("final_lgtm_by_user_id").references(() => usersTable.userId),
  disputeStatus: boolean("dispute_status").notNull().default(false),
  disputeComment: text("dispute_comment"),
  leadComment: text("lead_comment"),
  quarter: text("quarter"),
  year: integer("year"),
  totalWeightedRating: real("total_weighted_rating"),
});

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({
  approvalId: true,
});
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
