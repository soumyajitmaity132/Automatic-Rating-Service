import { pgTable, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const usersTable = pgTable("users", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  securityKey: text("security_key"),
  password: text("password").notNull(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  teamId: integer("team_id").references(() => teamsTable.teamId),
  role: text("role").notNull().default("User"),
  level: text("level").notNull().default("L1"),
  createdAt: timestamp("created_at").defaultNow(),
  ldap: text("ldap").unique(),
  process: text("process"),
  vacoEmployeeCode: text("vaco_employee_code"),
  joiningDate: date("joining_date"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
