import { pgTable, serial, doublePrecision, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsToRateTable } from "./items";
import { usersTable } from "./users";

export const tlDraftTable = pgTable("tl_draft", {
  draftId: serial("draft_id").primaryKey(),
  ratingValue: doublePrecision("rating_value"),
  itemId: integer("item_id")
    .references(() => itemsToRateTable.itemId),
  projectName: varchar("project_name", { length: 255 }),
  ratedUserId: text("rated_user_id")
    .references(() => usersTable.userId),
  teamLeadUserId: text("team_lead_user_id")
    .references(() => usersTable.userId),
  leadComment: text("lead_comment"),
  quarter: text("quarter"),
  year: integer("year"),
  isActive: boolean("is_active").default(true),
  updatedOn: timestamp("updated_on").defaultNow(),
});

export const insertTlDraftSchema = createInsertSchema(tlDraftTable).omit({
  draftId: true,
  updatedOn: true,
});
export type InsertTlDraft = z.infer<typeof insertTlDraftSchema>;
export type TlDraft = typeof tlDraftTable.$inferSelect;
