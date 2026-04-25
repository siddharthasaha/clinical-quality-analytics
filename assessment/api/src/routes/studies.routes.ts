import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/overview', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const query = `
      SELECT
        study_id,
        study_name,
        study_phase,
        COUNT(DISTINCT participant_id)::int AS participant_count,
        COUNT(*)::int AS total_measurements,
        COUNT(DISTINCT site_id)::int AS site_count
      FROM clinical_data_raw
      GROUP BY study_id, study_name, study_phase
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
    console.error('Error fetching study overview:', error);

    res.status(500).json({
      error: 'Failed to fetch study overview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;