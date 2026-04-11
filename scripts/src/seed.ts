import { db, teamsTable, usersTable, itemsToRateTable, ratingsTable, approvalsTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function hashPassword(p: string) {
  return bcrypt.hash(p, 12);
}

async function seed() {
  console.log("🌱 Seeding database...");

  // Use TRUNCATE CASCADE to clear all tables while respecting foreign keys
  await db.execute("TRUNCATE TABLE approvals, ratings, items_to_rate, users, teams CASCADE");


  // ── Teams ─────────────────────────────────────────────────
  const [teamAlpha] = await db.insert(teamsTable).values({ teamName: "SCIM Team Alpha", tlUserId: null, managerUserId: null }).returning();
  const [teamBeta]  = await db.insert(teamsTable).values({ teamName: "SCIM Team Beta",  tlUserId: null, managerUserId: null }).returning();
  console.log(`✅ Teams: ${teamAlpha.teamName} (${teamAlpha.teamId}), ${teamBeta.teamName} (${teamBeta.teamId})`);

  // ── Users ──────────────────────────────────────────────────
  const [manager] = await db.insert(usersTable).values({
    userId: "MGR001", displayName: "Alice Johnson", username: "alice.johnson",
    email: "alice.johnson@highspring.com", password: await hashPassword("Manager@123"),
    role: "Manager", level: "L3", teamId: teamAlpha.teamId,
  }).returning();

  const [tl1] = await db.insert(usersTable).values({
    userId: "TL001", displayName: "Bob Smith", username: "bob.smith",
    email: "bob.smith@highspring.com", password: await hashPassword("TeamLead@123"),
    role: "Team Lead", level: "L2", teamId: teamAlpha.teamId,
  }).returning();

  const [tl2] = await db.insert(usersTable).values({
    userId: "TL002", displayName: "Diana Prince", username: "diana.prince",
    email: "diana.prince@highspring.com", password: await hashPassword("TeamLead@123"),
    role: "Team Lead", level: "L2", teamId: teamBeta.teamId,
  }).returning();

  const [user1] = await db.insert(usersTable).values({
    userId: "USR001", displayName: "Charlie Brown", username: "charlie.brown",
    email: "charlie.brown@highspring.com", password: await hashPassword("User@123"),
    role: "User", level: "L1", teamId: teamAlpha.teamId,
  }).returning();

  const [user2] = await db.insert(usersTable).values({
    userId: "USR002", displayName: "Eve Wilson", username: "eve.wilson",
    email: "eve.wilson@highspring.com", password: await hashPassword("User@123"),
    role: "User", level: "L1", teamId: teamAlpha.teamId,
  }).returning();

  const [user3] = await db.insert(usersTable).values({
    userId: "USR003", displayName: "Frank Miller", username: "frank.miller",
    email: "frank.miller@highspring.com", password: await hashPassword("User@123"),
    role: "User", level: "L2", teamId: teamBeta.teamId,
  }).returning();

  console.log(`✅ Created: 1 Manager, 2 Team Leads, 3 Users`);

  // Update team TL/Manager refs
  await db.update(teamsTable).set({ tlUserId: tl1.userId, managerUserId: manager.userId }).where(eq(teamsTable.teamId, teamAlpha.teamId));
  await db.update(teamsTable).set({ tlUserId: tl2.userId, managerUserId: manager.userId }).where(eq(teamsTable.teamId, teamBeta.teamId));

  // ── KPI Items (shared across both teams) ──────────────────
  const kpiDefs = [
    { itemName: "SCIM Project Delivery",      description: "Core delivery of SCIM project tasks and milestones",          weight: 0.55, category: "Core Contributions" },
    { itemName: "Org Contributions",           description: "Contributions to organizational initiatives and culture",       weight: 0.10, category: "Org Contributions" },
    { itemName: "Value Addition",              description: "Additional value brought beyond assigned scope",                weight: 0.10, category: "Value Addition" },
    { itemName: "Leave Management",            description: "Attendance, leave planning, and adherence to leave policies",   weight: 0.10, category: "Leave Management" },
    { itemName: "Subjective Feedback",         description: "Qualitative feedback on communication, teamwork, and attitude", weight: 0.10, category: "Subjective Feedback" },
    { itemName: "Self Learning & Development", description: "Proactive upskilling, certifications, and knowledge sharing",  weight: 0.05, category: "Self Learning & Development" },
  ];

  const alphaItems = await db.insert(itemsToRateTable).values(kpiDefs.map(k => ({ ...k, teamId: teamAlpha.teamId }))).returning();
  const betaItems  = await db.insert(itemsToRateTable).values(kpiDefs.map(k => ({ ...k, teamId: teamBeta.teamId  }))).returning();
  console.log(`✅ Created ${alphaItems.length + betaItems.length} KPI items`);

  // ── Mock Ratings & Approvals ───────────────────────────────
  const Q = "Q1"; const Y = 2025;

  // Helper
  async function addRating(userId: string, itemId: number, val: number, comment: string) {
    const [r] = await db.insert(ratingsTable).values({
      itemId, userId, ratingValue: val, comment, quarter: Q, year: Y, artifactLinks: "",
    }).returning();
    return r;
  }

  async function addApproval(opts: {
    itemId: number; teamId: number; ratedUserId: string;
    selfVal: number; tlVal?: number | null; tlStatus: string;
    finalStatus: string; tlBy?: string; finalBy?: string; disputed?: boolean;
  }) {
    await db.insert(approvalsTable).values({
      itemId: opts.itemId,
      teamId: opts.teamId,
      ratedUserId: opts.ratedUserId,
      selfRatingValue: opts.selfVal,
      tlRatingValue: opts.tlVal ?? null,
      tlLgtmStatus: opts.tlStatus,
      tlLgtmTimestamp: opts.tlVal ? new Date() : null,
      tlLgtmByUserId: opts.tlBy ?? null,
      finalLgtmStatus: opts.finalStatus,
      finalLgtmTimestamp: opts.finalStatus !== "Pending" ? new Date() : null,
      finalLgtmByUserId: opts.finalBy ?? null,
      disputeStatus: opts.disputed ?? false,
      quarter: Q,
      year: Y,
    });
  }

  // Charlie Brown (USR001 / Alpha) — 2 items Pending TL, 2 items TL Approved, 1 Fully Completed
  const c1 = await addRating(user1.userId, alphaItems[0].itemId, 4.2, "Delivered all sprint tasks on time.");
  const c2 = await addRating(user1.userId, alphaItems[1].itemId, 3.8, "Participated in two org-wide initiatives.");
  const c3 = await addRating(user1.userId, alphaItems[2].itemId, 4.0, "Added a reusable auth library.");
  const c4 = await addRating(user1.userId, alphaItems[3].itemId, 5.0, "Zero unplanned leaves.");
  const c5 = await addRating(user1.userId, alphaItems[4].itemId, 3.5, "Received positive peer feedback.");

  // 2 Pending TL Approval
  await addApproval({ itemId: c1.itemId, teamId: teamAlpha.teamId, ratedUserId: user1.userId, selfVal: 4.2, tlStatus: "Pending", finalStatus: "Pending" });
  await addApproval({ itemId: c2.itemId, teamId: teamAlpha.teamId, ratedUserId: user1.userId, selfVal: 3.8, tlStatus: "Pending", finalStatus: "Pending" });

  // 2 TL Approved, Pending Final LGTM
  await addApproval({ itemId: c3.itemId, teamId: teamAlpha.teamId, ratedUserId: user1.userId, selfVal: 4.0, tlVal: 3.8, tlStatus: "Approved", finalStatus: "Pending", tlBy: tl1.userId });
  await addApproval({ itemId: c4.itemId, teamId: teamAlpha.teamId, ratedUserId: user1.userId, selfVal: 5.0, tlVal: 4.5, tlStatus: "Approved", finalStatus: "Pending", tlBy: tl1.userId });

  // 1 Fully Completed (TL + Manager approved)
  await addApproval({ itemId: c5.itemId, teamId: teamAlpha.teamId, ratedUserId: user1.userId, selfVal: 3.5, tlVal: 3.7, tlStatus: "Approved", finalStatus: "Approved", tlBy: tl1.userId, finalBy: manager.userId });

  // Eve Wilson (USR002 / Alpha) — basic pending ratings
  await addRating(user2.userId, alphaItems[0].itemId, 3.9, "Met most project milestones.");
  await addRating(user2.userId, alphaItems[5].itemId, 4.5, "Completed 3 certifications this quarter.");

  // Frank Miller (USR003 / Beta) — basic pending ratings
  await addRating(user3.userId, betaItems[0].itemId, 4.7, "Led the SCIM integration module.");
  await addRating(user3.userId, betaItems[2].itemId, 4.0, "Created shared component library.");

  console.log(`✅ Mock ratings and approvals created`);

  console.log("\n🎉 Seed complete!");
  console.log("─".repeat(60));
  console.log("📋 Login Credentials:");
  console.log("  Role        | Username         | Password");
  console.log("  Manager     | alice.johnson    | Manager@123");
  console.log("  Team Lead 1 | bob.smith        | TeamLead@123");
  console.log("  Team Lead 2 | diana.prince     | TeamLead@123");
  console.log("  User 1      | charlie.brown    | User@123");
  console.log("  User 2      | eve.wilson       | User@123");
  console.log("  User 3      | frank.miller     | User@123");
  console.log("─".repeat(60));

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
