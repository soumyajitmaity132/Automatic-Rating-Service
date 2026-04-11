import { pgTable, serial, text, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const itemsToRateTable = pgTable("items_to_rate", {
  itemId: serial("item_id").primaryKey(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  level: text("level"),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.teamId),
  weight: real("weight").notNull(),
  category: text("category"),
  targetRole: text("target_role").notNull().default("User"),
});

export const insertItemSchema = createInsertSchema(itemsToRateTable).omit({
  itemId: true,
});
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsToRateTable.$inferSelect;
