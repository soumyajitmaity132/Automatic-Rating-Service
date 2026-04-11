import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamsTable = pgTable("teams", {
  teamId: serial("team_id").primaryKey(),
  teamName: text("team_name").notNull(),
  tlUserId: text("tl_user_id"),
  managerUserId: text("manager_user_id"),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({
  teamId: true,
});
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
