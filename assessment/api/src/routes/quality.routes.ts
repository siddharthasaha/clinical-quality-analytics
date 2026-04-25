import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/distribution', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const query = `
      SELECT
        study_id,
        study_name,
        COUNT(*)::int AS total_measurements,
        COALESCE(AVG((quality_score)::numeric), 0)::float AS avg_quality_score,
        COUNT(*) FILTER (
          WHERE (quality_score)::numeric >= 0.9
        )::int AS high_quality_count,
        COUNT(*) FILTER (
          WHERE (quality_score)::numeric < 0.8
        )::int AS low_quality_count
      FROM clinical_data_raw
      GROUP BY study_id, study_name
      ORDER BY study_id;
    `;

    const result = await pool.query(query);

    const executionTime = Date.now() - startTime;

    res.json({
      data: result.rows,
      executionTime: `${executionTime}ms`,
      executionTimeSeconds: Number((executionTime / 1000).toFixed(2)),
    });
  } catch (error) {
    console.error('Error fetching quality distribution:', error);

    res.status(500).json({
      error: 'Failed to fetch quality distribution',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;