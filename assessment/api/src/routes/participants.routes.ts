import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/summary', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const result = await pool.query(`
      WITH participant_stats AS (
        SELECT
          study_id,
          MIN(study_name) AS study_name,
          COUNT(DISTINCT participant_id)::int AS total_participants,
          ROUND(AVG(
            EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob::date))
          )::numeric, 1) AS avg_age,
          MIN(
            EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob::date))
          )::int AS min_age,
          MAX(
            EXTRACT(YEAR FROM AGE(CURRENT_DATE, participant_dob::date))
          )::int AS max_age,
          ROUND(
            (COUNT(*)::numeric / COUNT(DISTINCT participant_id)::numeric), 1
          ) AS avg_measurements_per_participant,
          MIN(measurement_timestamp) AS data_start_date,
          MAX(measurement_timestamp) AS data_end_date
        FROM clinical_data_raw
        GROUP BY study_id
      ),
      gender_agg AS (
        SELECT
          study_id,
          json_agg(
            json_build_object('gender', gender, 'count', count)
            ORDER BY count DESC
          ) AS gender_breakdown
        FROM (
          SELECT study_id, participant_gender AS gender,
                 COUNT(DISTINCT participant_id)::int AS count
          FROM clinical_data_raw
          GROUP BY study_id, participant_gender
        ) g
        GROUP BY study_id
      ),
      site_agg AS (
        SELECT
          study_id,
          json_agg(
            json_build_object(
              'site_id', site_id,
              'site_name', site_name,
              'site_location', site_location,
              'participant_count', participant_count
            ) ORDER BY participant_count DESC
          ) AS site_distribution
        FROM (
          SELECT study_id, site_id,
                 MIN(site_name) AS site_name,
                 MIN(site_location) AS site_location,
                 COUNT(DISTINCT participant_id)::int AS participant_count
          FROM clinical_data_raw
          GROUP BY study_id, site_id
        ) s
        GROUP BY study_id
      )
      SELECT
        p.study_id,
        p.study_name,
        p.total_participants,
        p.avg_age,
        p.min_age,
        p.max_age,
        p.avg_measurements_per_participant,
        p.data_start_date,
        p.data_end_date,
        ga.gender_breakdown,
        sa.site_distribution
      FROM participant_stats p
      LEFT JOIN gender_agg ga ON ga.study_id = p.study_id
      LEFT JOIN site_agg   sa ON sa.study_id = p.study_id
      ORDER BY p.study_id
    `);

    const executionTime = Date.now() - startTime;

    res.json({
      data: result.rows,
      executionTime: `${executionTime}ms`,
      executionTimeSeconds: (executionTime / 1000).toFixed(2),
    });
  } catch (error) {
    console.error('Error fetching participant summary:', error);
    res.status(500).json({
      error: 'Failed to fetch participant summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
