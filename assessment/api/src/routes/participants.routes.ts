import { Router, Request, Response } from 'express';
import { pool } from '../db';

/**
 * Wraps a PostgreSQL error with additional context about which query failed.
 * Carries the original error as `cause` for full stack trace preservation.
 */
export class DatabaseError extends Error {
  readonly cause: unknown;
  constructor(context: string, cause: unknown) {
    super(`Database error in ${context}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'DatabaseError';
    this.cause = cause;
  }
}

/**
 * Validates the optional studyId path parameter.
 * Allowed characters: alphanumeric, hyphens, and underscores (max 64 chars).
 *
 * @throws {Error} with a descriptive message when the value is invalid.
 */
export function validateStudyId(studyId: string | undefined): void {
  if (studyId === undefined) return;
  if (studyId.length === 0 || studyId.length > 64) {
    throw Object.assign(new Error('studyId must be between 1 and 64 characters'), { statusCode: 400 });
  }
  if (!/^[A-Za-z0-9_-]+$/.test(studyId)) {
    throw Object.assign(new Error('studyId contains invalid characters'), { statusCode: 400 });
  }
}

const router = Router();

type ParticipantSummary = {
  study_id: string;
  study_name: string;
  total_participants: number;
  avg_age: number;
  min_age: number;
  max_age: number;
  avg_measurements_per_participant: number;
  data_start_date: string;
  data_end_date: string;
};

type GenderBreakdown = {
  study_id: string;
  gender: string;
  count: number;
};

type SiteDistribution = {
  study_id: string;
  site_id: string;
  site_name: string;
  site_location: string;
  participant_count: number;
};

/**
 * Returns a SQL WHERE clause fragment that filters by study_id when one is provided.
 * Returns an empty string when no filter is needed (all studies).
 *
 * @param studyId - Optional study identifier to filter on.
 * @returns A SQL fragment: `'WHERE study_id = $1'` or `''`.
 */
export const studyFilter = (studyId?: string): string =>
  studyId ? 'WHERE study_id = $1' : '';

/**
 * Builds the positional parameter array to accompany a filtered query.
 * Matches the `$1` placeholder emitted by {@link studyFilter}.
 *
 * @param studyId - Optional study identifier.
 * @returns An array containing the studyId, or an empty array.
 */
export const queryParams = (studyId?: string): string[] =>
  studyId ? [studyId] : [];

/**
 * Queries aggregate participant statistics from `clinical_data_raw`.
 * Uses a two-level CTE: first deduplicate at the participant level, then
 * aggregate per study to compute accurate age and measurement averages.
 *
 * @param studyId - Optional study identifier. When supplied only that study is returned.
 * @returns An array of {@link ParticipantSummary} rows ordered by `study_id`.
 */
export async function getParticipantStats(studyId?: string): Promise<ParticipantSummary[]> {
  const query = `
    WITH participant_level AS (
      SELECT
        study_id,
        MIN(study_name) AS study_name,
        participant_id,
        MIN(participant_dob::date) AS participant_dob,
        COUNT(*)::int AS measurement_count,
        MIN(measurement_timestamp::timestamp) AS first_measurement_date,
        MAX(measurement_timestamp::timestamp) AS last_measurement_date
      FROM clinical_data_raw
      ${studyFilter(studyId)}
      GROUP BY study_id, participant_id
    )
    SELECT
      study_id,
      MIN(study_name) AS study_name,
      COUNT(*)::int AS total_participants,
      ROUND(AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob)))::numeric, 1)::float AS avg_age,
      MIN(EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob)))::int AS min_age,
      MAX(EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob)))::int AS max_age,
      ROUND(AVG(measurement_count)::numeric, 1)::float AS avg_measurements_per_participant,
      MIN(first_measurement_date) AS data_start_date,
      MAX(last_measurement_date) AS data_end_date
    FROM participant_level
    GROUP BY study_id
    ORDER BY study_id;
  `;

  try {
    const result = await pool.query(query, queryParams(studyId));
    return result.rows;
  } catch (err) {
    throw new DatabaseError('getParticipantStats', err);
  }
}

/**
 * Queries distinct participant counts broken down by gender for each study.
 * Results are ordered by `study_id`, then by count descending so the most
 * prevalent gender appears first.
 *
 * @param studyId - Optional study identifier. When supplied only that study is returned.
 * @returns An array of {@link GenderBreakdown} rows.
 */
export async function getGenderBreakdown(studyId?: string): Promise<GenderBreakdown[]> {
  const query = `
    SELECT
      study_id,
      participant_gender AS gender,
      COUNT(DISTINCT participant_id)::int AS count
    FROM clinical_data_raw
    ${studyFilter(studyId)}
    GROUP BY study_id, participant_gender
    ORDER BY study_id, count DESC;
  `;

  try {
    const result = await pool.query(query, queryParams(studyId));
    return result.rows;
  } catch (err) {
    throw new DatabaseError('getGenderBreakdown', err);
  }
}

/**
 * Queries distinct participant counts broken down by clinical site for each study.
 * Results are ordered by `study_id`, then by participant count descending so the
 * largest site appears first.
 *
 * @param studyId - Optional study identifier. When supplied only that study is returned.
 * @returns An array of {@link SiteDistribution} rows.
 */
export async function getSiteDistribution(studyId?: string): Promise<SiteDistribution[]> {
  const query = `
    SELECT
      study_id,
      site_id,
      MIN(site_name) AS site_name,
      MIN(site_location) AS site_location,
      COUNT(DISTINCT participant_id)::int AS participant_count
    FROM clinical_data_raw
    ${studyFilter(studyId)}
    GROUP BY study_id, site_id
    ORDER BY study_id, participant_count DESC;
  `;

  try {
    const result = await pool.query(query, queryParams(studyId));
    return result.rows;
  } catch (err) {
    throw new DatabaseError('getSiteDistribution', err);
  }
}

/**
 * GET /participants/summary
 * GET /participants/summary/:studyId
 *
 * Returns aggregate participant data for all studies, or a single study when
 * `studyId` is provided. The three data sources (stats, gender, sites) are
 * fetched in parallel and merged in application code before responding.
 *
 * @param req.params.studyId - Optional. When present, only that study is returned
 *   and the response `data` field is a single object rather than an array.
 *   Responds with 404 if the studyId is not found.
 *
 * Response body:
 * ```json
 * {
 *   "data": ParticipantSummary | ParticipantSummary[],
 *   "executionTime": "123ms",
 *   "executionTimeSeconds": 0.123
 * }
 * ```
 */
router.get('/summary/:studyId?', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { studyId } = req.params;

  try {
    validateStudyId(studyId);

    const [summaries, genderBreakdowns, siteDistributions] = await Promise.all([
      getParticipantStats(studyId),
      getGenderBreakdown(studyId),
      getSiteDistribution(studyId),
    ]);

    const data = summaries.map((summary) => ({
      ...summary,
      gender_breakdown: genderBreakdowns
        .filter((item) => item.study_id === summary.study_id)
        .map(({ study_id, ...rest }) => rest),
      site_distribution: siteDistributions
        .filter((item) => item.study_id === summary.study_id)
        .map(({ study_id, ...rest }) => rest),
    }));

    if (studyId && data.length === 0) {
      return res.status(404).json({
        error: 'Study not found',
        studyId,
      });
    }

    const executionTime = Date.now() - startTime;

    res.json({
      data: studyId ? data[0] : data,
      executionTime: `${executionTime}ms`,
      executionTimeSeconds: Number((executionTime / 1000).toFixed(2)),
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error && (error as Error & { statusCode: number }).statusCode === 400) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message,
      });
    }

    if (error instanceof DatabaseError) {
      console.error('[participants] Database error:', error.message, error.cause);
      return res.status(503).json({
        error: 'Database query failed',
        message: error.message,
      });
    }

    console.error('[participants] Unexpected error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;