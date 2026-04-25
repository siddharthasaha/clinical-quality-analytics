import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/overview', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const query = `
      WITH study_measurements AS (
  SELECT
    study_id,
    MIN(study_name) AS study_name,
    MIN(study_phase) AS study_phase,
    COUNT(*)::int AS total_measurements
  FROM clinical_data_raw
  GROUP BY study_id
),
study_participants AS (
  SELECT
    study_id,
    COUNT(*)::int AS participant_count
  FROM (
    SELECT DISTINCT study_id, participant_id
    FROM clinical_data_raw
  ) p
  GROUP BY study_id
),
study_sites AS (
  SELECT
    study_id,
    COUNT(*)::int AS site_count
  FROM (
    SELECT DISTINCT study_id, site_id
    FROM clinical_data_raw
  ) s
  GROUP BY study_id
)
SELECT
  m.study_id,
  m.study_name,
  m.study_phase,
  p.participant_count,
  m.total_measurements,
  s.site_count
FROM study_measurements m
JOIN study_participants p ON p.study_id = m.study_id
JOIN study_sites s ON s.study_id = m.study_id
ORDER BY m.study_id;
    `;

    const result = await pool.query(query);

    const executionTime = Date.now() - startTime;

    res.json({
      data: result.rows,
      executionTime: `${executionTime}ms`,
      executionTimeSeconds: Number((executionTime / 1000).toFixed(2)),
    });
  } catch (error) {
    console.error('Error fetching study overview:', error);

    res.status(500).json({
      error: 'Failed to fetch study overview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;