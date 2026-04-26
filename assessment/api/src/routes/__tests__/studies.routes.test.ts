import express from 'express';
import request from 'supertest';

// Mock the db module before importing the route so pool.query is injectable
jest.mock('../../db', () => ({
  pool: { query: jest.fn() },
}));

import { pool } from '../../db';
import router from '../studies.routes';

const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

// ---------------------------------------------------------------------------
// Minimal Express app used by supertest
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/studies', router);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeOverviewRow = (overrides = {}) => ({
  study_id: 'CARDIO001',
  study_name: 'Cardiovascular Health Study',
  study_phase: 'Phase III',
  participant_count: 120,
  total_measurements: 5000,
  site_count: 8,
  ...overrides,
});

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// GET /studies/overview — success cases
// ---------------------------------------------------------------------------
describe('GET /studies/overview — success', () => {
  it('returns 200 with an array of study rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeOverviewRow()] } as never);

    const res = await request(app).get('/studies/overview');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns all expected fields on each row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeOverviewRow()] } as never);

    const res = await request(app).get('/studies/overview');
    const row = res.body.data[0];
    expect(row).toHaveProperty('study_id', 'CARDIO001');
    expect(row).toHaveProperty('study_name', 'Cardiovascular Health Study');
    expect(row).toHaveProperty('study_phase', 'Phase III');
    expect(row).toHaveProperty('participant_count', 120);
    expect(row).toHaveProperty('total_measurements', 5000);
    expect(row).toHaveProperty('site_count', 8);
  });

  it('returns multiple studies in order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeOverviewRow({ study_id: 'CARDIO001' }),
        makeOverviewRow({ study_id: 'NEURO002', study_name: 'Neurology Study' }),
      ],
    } as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].study_id).toBe('CARDIO001');
    expect(res.body.data[1].study_id).toBe('NEURO002');
  });

  it('returns an empty array when no studies exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/studies/overview');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('includes executionTime as a string ending in ms', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body).toHaveProperty('executionTime');
    expect(res.body.executionTime).toMatch(/^\d+ms$/);
  });

  it('includes executionTimeSeconds as a number', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body).toHaveProperty('executionTimeSeconds');
    expect(typeof res.body.executionTimeSeconds).toBe('number');
  });

  it('executes exactly one query per request', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('query uses a WITH clause (CTEs)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WITH\s+study_measurements/i);
  });

  it('query includes study_participants CTE', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/study_participants/i);
  });

  it('query includes study_sites CTE', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/study_sites/i);
  });

  it('query selects participant_count and site_count via JOINs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/participant_count/i);
    expect(sql).toMatch(/site_count/i);
  });

  it('query orders by study_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY m\.study_id/i);
  });

  it('query uses DISTINCT to count unique participants', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SELECT DISTINCT study_id, participant_id/i);
  });

  it('query uses DISTINCT to count unique sites', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SELECT DISTINCT study_id, site_id/i);
  });

  it('query uses ::int cast on count columns', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await request(app).get('/studies/overview');
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/COUNT\(\*\)::int/i);
  });
});

// ---------------------------------------------------------------------------
// GET /studies/overview — error cases
// ---------------------------------------------------------------------------
describe('GET /studies/overview — errors', () => {
  it('returns 500 when pool.query throws an Error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused') as never);

    const res = await request(app).get('/studies/overview');
    expect(res.status).toBe(500);
  });

  it('returns error field in body on database failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down') as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/failed to fetch study overview/i);
  });

  it('returns message field containing the original error message', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout after 30s') as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body.message).toBe('timeout after 30s');
  });

  it('returns message "Unknown error" for non-Error thrown values', async () => {
    mockQuery.mockRejectedValueOnce('unexpected string error' as never);

    const res = await request(app).get('/studies/overview');
    expect(res.body.message).toBe('Unknown error');
  });
});
