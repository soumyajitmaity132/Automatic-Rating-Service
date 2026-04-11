import { pgTable, serial, integer, text, varchar, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { itemsToRateTable } from "./items";
import { usersTable } from "./users";

export const ratingsTable = pgTable("ratings", {
  ratingId: serial("rating_id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => itemsToRateTable.itemId),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.userId),
  ratingValue: real("rating_value").notNull(),
  quarter: text("quarter").notNull(),
  year: integer("year").notNull(),
  artifactLinks: text("artifact_links"),
  kpiAchieved: text("KPI_achieved"),
  projectName: varchar("project_name", { length: 255 }),
  status: text("status").default("pending"),
  createdOn: timestamp("created_on").defaultNow(),
});

export const insertRatingSchema = createInsertSchema(ratingsTable).omit({
  ratingId: true,
  createdOn: true,
});
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
