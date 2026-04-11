import { pgTable, serial, real, integer, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsToRateTable } from "./items";
import { usersTable } from "./users";

export const tlDraftTable = pgTable("tl_draft", {
  draftId: serial("draft_id").primaryKey(),
  ratingValue: real("rating_value"),
  itemId: integer("item_id")
    .notNull()
    .references(() => itemsToRateTable.itemId),
  projectName: varchar("project_name", { length: 255 }),
  ratedUserId: text("rated_user_id")
    .notNull()
    .references(() => usersTable.userId),
  teamLeadUserId: text("team_lead_user_id")
    .notNull()
    .references(() => usersTable.userId),
  leadComment: text("lead_comment"),
  quarter: text("quarter").notNull(),
  year: integer("year").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedOn: timestamp("updated_on").defaultNow(),
});

export const insertTlDraftSchema = createInsertSchema(tlDraftTable).omit({
  draftId: true,
  updatedOn: true,
});
export type InsertTlDraft = z.infer<typeof insertTlDraftSchema>;
export type TlDraft = typeof tlDraftTable.$inferSelect;
