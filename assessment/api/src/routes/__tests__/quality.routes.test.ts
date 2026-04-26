import express from 'express';
import request from 'supertest';

// Mock the db module before importing the route so pool.query is injectable
jest.mock('../../db', () => ({
  pool: { query: jest.fn() },
}));

import { pool } from '../../db';
import router from '../quality.routes';

const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

// ---------------------------------------------------------------------------
// Minimal Express app used by supertest
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/quality', router);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeDistributionRow = (overrides = {}) => ({
  study_id: 'CARDIO001',
  study_name: 'Cardiovascular Health Study',
  total_measurements: 5000,
  avg_quality_score: 0.87,
  high_quality_count: 2500,
  low_quality_count: 800,
  ...overrides,
});

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// GET /quality/distribution — success cases
// ---------------------------------------------------------------------------
describe('GET /quality/distribution — success', () => {
  it('returns 200 with an array of study rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeDistributionRow()] } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns all expected fields on each row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeDistributionRow()] } as never);

    const res = await request(app).get('/quality/distribution');
    const row = res.body.data[0];
    expect(row).toHaveProperty('study_id', 'CARDIO001');
    expect(row).toHaveProperty('study_name', 'Cardiovascular Health Study');
    expect(row).toHaveProperty('total_measurements', 5000);
    expect(row).toHaveProperty('avg_quality_score', 0.87);
    expect(row).toHaveProperty('high_quality_count', 2500);
    expect(row).toHaveProperty('low_quality_count', 800);
  });

  it('returns multiple studies in order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeDistributionRow({ study_id: 'CARDIO001' }),
        makeDistributionRow({ study_id: 'NEURO002', study_name: 'Neurology Study' }),
      ],
    } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].study_id).toBe('CARDIO001');
    expect(res.body.data[1].study_id).toBe('NEURO002');
  });

  it('returns an empty array when no studies exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('includes executionTime as a string ending in ms', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body).toHaveProperty('executionTime');
    expect(res.body.executionTime).toMatch(/^\d+ms$/);
  });

  it('includes executionTimeSeconds as a number', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body).toHaveProperty('executionTimeSeconds');
    expect(typeof res.body.executionTimeSeconds).toBe('number');
  });

  it('executes exactly one query per request', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('issues a query that selects study_id and study_name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/study_id/i);
    expect(sql).toMatch(/study_name/i);
  });

  it('issues a query that groups by study_id and study_name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/GROUP BY study_id, study_name/i);
  });

  it('issues a query that orders by study_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY study_id/i);
  });

  it('query includes ::int cast on total_measurements', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/COUNT\(\*\)::int AS total_measurements/i);
  });

  it('query uses COALESCE and ::float on avg_quality_score', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/COALESCE/i);
    expect(sql).toMatch(/avg_quality_score/i);
  });

  it('query applies ::numeric cast inside FILTER thresholds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/quality/distribution');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/quality_score.*::numeric/i);
  });

  it('avg_quality_score is 0 when COALESCE receives null (simulated)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeDistributionRow({ avg_quality_score: 0 })],
    } as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body.data[0].avg_quality_score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /quality/distribution — error cases
// ---------------------------------------------------------------------------
describe('GET /quality/distribution — errors', () => {
  it('returns 500 when pool.query throws an Error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused') as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.status).toBe(500);
  });

  it('returns error field in body on database failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down') as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/failed to fetch quality distribution/i);
  });

  it('returns message field containing the original error message', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout after 30s') as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body.message).toBe('timeout after 30s');
  });

  it('returns message "Unknown error" for non-Error thrown values', async () => {
    mockQuery.mockRejectedValueOnce('unexpected string error' as never);

    const res = await request(app).get('/quality/distribution');
    expect(res.body.message).toBe('Unknown error');
  });
});
