import { Router } from "express";
import { db } from "@workspace/db";
import { pool } from "@workspace/db";
import { usersTable, teamsTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import { signToken, comparePassword, hashPassword } from "../lib/auth.js";
import { authenticate, AuthRequest, requireRole } from "../middlewares/authenticate.js";
import { randomInt } from "crypto";
import { sendEmail } from "../lib/mailer.js";

const router = Router();

let ensureResetTablePromise: Promise<void> | null = null;

async function ensurePasswordResetTable() {
  if (!ensureResetTablePromise) {
    ensureResetTablePromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS password_reset_codes (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
          consumed BOOLEAN NOT NULL DEFAULT FALSE,
          created_on TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined);
  }

  await ensureResetTablePromise;
}

function generatePasscode(): string {
  return String(randomInt(100000, 1000000));
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Bad Request", message: "Username/email and password required" });
    return;
  }

  try {
    // Accept login with either username or email
    const usernameOrEmail = String(username).trim().toLowerCase();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, usernameOrEmail),
          eq(usersTable.email, usernameOrEmail)
        )
      );

    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
      return;
    }

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    const token = signToken({
      userId: user.userId,
      username: user.username,
      role: user.role,
      teamId: user.teamId,
    });

    res.json({
      token,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        teamId: user.teamId,
        teamName,
      },
    });
  } catch (err) {
    req.log.error(err, "Login error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/forgot-password/request", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Bad Request", message: "Email is required" });
      return;
    }

    await ensurePasswordResetTable();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (user) {
      const passcode = generatePasscode();
      const codeHash = await hashPassword(passcode);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        `
          UPDATE password_reset_codes
          SET consumed = TRUE
          WHERE email = $1 AND consumed = FALSE
        `,
        [email],
      );

      await pool.query(
        `
          INSERT INTO password_reset_codes (user_id, email, code_hash, expires_at, consumed)
          VALUES ($1, $2, $3, $4, FALSE)
        `,
        [user.userId, email, codeHash, expiresAt],
      );

      await sendEmail({
        to: email,
        subject: "Your Employee Performance Portal reset code",
        text: `Hi ${user.displayName},\n\nYour password reset verification code is: ${passcode}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
      });
    }

    res.json({ message: "If this email exists, a passcode has been sent." });
  } catch (err) {
    req.log.error(err, "Forgot password request error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();
    const newPassword = String(req.body?.newPassword ?? "");

    if (!email || !code || !newPassword) {
      res.status(400).json({ error: "Bad Request", message: "email, code and newPassword are required" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "Bad Request", message: "Password must be at least 6 characters" });
      return;
    }

    await ensurePasswordResetTable();

    const resetResult = await pool.query(
      `
        SELECT id, user_id, code_hash, expires_at, consumed
        FROM password_reset_codes
        WHERE email = $1
        ORDER BY created_on DESC
        LIMIT 1
      `,
      [email],
    );

    const row = resetResult.rows[0];
    if (!row) {
      res.status(400).json({ error: "Bad Request", message: "Invalid or expired passcode" });
      return;
    }

    const isExpired = new Date(row.expires_at).getTime() < Date.now();
    if (row.consumed || isExpired) {
      res.status(400).json({ error: "Bad Request", message: "Invalid or expired passcode" });
      return;
    }

    const codeValid = await comparePassword(code, row.code_hash);
    if (!codeValid) {
      res.status(400).json({ error: "Bad Request", message: "Invalid or expired passcode" });
      return;
    }

    const hashedPassword = await hashPassword(newPassword);

    const [updatedUser] = await db
      .update(usersTable)
      .set({ password: hashedPassword })
      .where(eq(usersTable.userId, row.user_id))
      .returning({ userId: usersTable.userId });

    if (!updatedUser) {
      res.status(404).json({ error: "Not Found", message: "User not found" });
      return;
    }

    await pool.query(
      `
        UPDATE password_reset_codes
        SET consumed = TRUE
        WHERE id = $1
      `,
      [row.id],
    );

    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    req.log.error(err, "Forgot password reset error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/test-email", authenticate, requireRole("Team Lead", "Manager"), async (req: AuthRequest, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Forbidden", message: "Test email endpoint is disabled in production" });
      return;
    }

    const requestedEmail = String(req.body?.email ?? "").trim().toLowerCase();

    let recipientEmail = requestedEmail;
    if (!recipientEmail) {
      const [currentUser] = await db
        .select({ email: usersTable.email, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.userId, req.user!.userId));

      if (!currentUser?.email) {
        res.status(400).json({ error: "Bad Request", message: "No email found for current user" });
        return;
      }

      recipientEmail = currentUser.email;
    }

    await sendEmail({
      to: recipientEmail,
      subject: "SMTP Test Email - Employee Performance Portal",
      text: `SMTP test succeeded.\n\nTime: ${new Date().toISOString()}\nFrom server: Employee Performance Portal API`,
    });

    res.json({ message: `Test email sent to ${recipientEmail}` });
  } catch (err) {
    req.log.error(err, "Test email send error");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to send test email" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, req.user!.userId));

    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }

    let teamName: string | null = null;
    if (user.teamId) {
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.teamId, user.teamId));
      teamName = team?.teamName ?? null;
    }

    res.json({
      userId: user.userId,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      role: user.role,
      level: user.level,
      teamId: user.teamId,
      teamName,
    });
  } catch (err) {
    req.log.error(err, "Get me error");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
