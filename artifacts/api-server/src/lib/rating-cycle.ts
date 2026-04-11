import { pool } from "@workspace/db";

let ensureTablePromise: Promise<void> | null = null;

export async function ensureRatingCyclesTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS rating_cycles (
          team_id INTEGER NOT NULL,
          quarter TEXT NOT NULL,
          year INTEGER NOT NULL,
          is_open BOOLEAN NOT NULL DEFAULT FALSE,
          updated_by_user_id TEXT,
          updated_on TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (team_id, quarter, year)
        )
      `)
      .then(() => undefined);
  }

  await ensureTablePromise;
}

export async function getRatingCycleStatus(teamId: number, quarter: string, year: number): Promise<boolean> {
  await ensureRatingCyclesTable();

  const result = await pool.query(
    `
      SELECT is_open
      FROM rating_cycles
      WHERE team_id = $1 AND quarter = $2 AND year = $3
      LIMIT 1
    `,
    [teamId, quarter, year],
  );

  if (result.rows.length === 0) {
    return false;
  }

  return !!result.rows[0]?.is_open;
}

export async function setRatingCycleStatus(
  teamId: number,
  quarter: string,
  year: number,
  isOpen: boolean,
  updatedByUserId: string,
): Promise<{ teamId: number; quarter: string; year: number; isOpen: boolean }> {
  await ensureRatingCyclesTable();

  const result = await pool.query(
    `
      INSERT INTO rating_cycles (team_id, quarter, year, is_open, updated_by_user_id, updated_on)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (team_id, quarter, year)
      DO UPDATE SET
        is_open = EXCLUDED.is_open,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_on = NOW()
      RETURNING team_id, quarter, year, is_open
    `,
    [teamId, quarter, year, isOpen, updatedByUserId],
  );

  const row = result.rows[0];
  return {
    teamId: row.team_id,
    quarter: row.quarter,
    year: row.year,
    isOpen: row.is_open,
  };
}
