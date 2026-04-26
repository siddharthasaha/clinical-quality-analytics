import express from 'express';
import request from 'supertest';

// Mock the db module before importing the route so pool.query is injectable
jest.mock('../../db', () => ({
  pool: { query: jest.fn() },
}));

import { pool } from '../../db';
import router, {
  DatabaseError,
  validateStudyId,
  studyFilter,
  queryParams,
  getParticipantStats,
  getGenderBreakdown,
  getSiteDistribution,
} from '../participants.routes';

const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

// ---------------------------------------------------------------------------
// Minimal Express app used by supertest
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use('/participants', router);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeSummaryRow = (overrides = {}) => ({
  study_id: 'S1',
  study_name: 'Alpha',
  total_participants: 100,
  avg_age: 42.5,
  min_age: 18,
  max_age: 75,
  avg_measurements_per_participant: 12.3,
  data_start_date: '2023-01-01T00:00:00Z',
  data_end_date: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeGenderRow = (overrides = {}) => ({
  study_id: 'S1',
  gender: 'Female',
  count: 60,
  ...overrides,
});

const makeSiteRow = (overrides = {}) => ({
  study_id: 'S1',
  site_id: 'SITE-001',
  site_name: 'Boston General',
  site_location: 'Boston, MA',
  participant_count: 40,
  ...overrides,
});

// ---------------------------------------------------------------------------
// DatabaseError
// ---------------------------------------------------------------------------
describe('DatabaseError', () => {
  it('has name DatabaseError', () => {
    const err = new DatabaseError('ctx', new Error('boom'));
    expect(err.name).toBe('DatabaseError');
  });

  it('includes context and Error message in its message', () => {
    const err = new DatabaseError('getParticipantStats', new Error('connection refused'));
    expect(err.message).toContain('getParticipantStats');
    expect(err.message).toContain('connection refused');
  });

  it('handles non-Error cause as string', () => {
    const err = new DatabaseError('ctx', 'raw string');
    expect(err.message).toContain('raw string');
  });

  it('preserves the original cause', () => {
    const original = new Error('original');
    const err = new DatabaseError('ctx', original);
    expect(err.cause).toBe(original);
  });

  it('is an instance of Error', () => {
    expect(new DatabaseError('ctx', 'x')).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// studyFilter
// ---------------------------------------------------------------------------
describe('studyFilter', () => {
  it('returns WHERE clause when studyId is provided', () => {
    expect(studyFilter('S1')).toBe('WHERE study_id = $1');
  });

  it('returns empty string when studyId is undefined', () => {
    expect(studyFilter(undefined)).toBe('');
  });

  it('returns empty string when called with no argument', () => {
    expect(studyFilter()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// queryParams
// ---------------------------------------------------------------------------
describe('queryParams', () => {
  it('returns array containing studyId when provided', () => {
    expect(queryParams('S1')).toEqual(['S1']);
  });

  it('returns empty array when studyId is undefined', () => {
    expect(queryParams(undefined)).toEqual([]);
  });

  it('returns empty array when called with no argument', () => {
    expect(queryParams()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateStudyId
// ---------------------------------------------------------------------------
describe('validateStudyId', () => {
  it('does not throw for undefined', () => {
    expect(() => validateStudyId(undefined)).not.toThrow();
  });

  it('does not throw for valid alphanumeric id', () => {
    expect(() => validateStudyId('STUDY001')).not.toThrow();
  });

  it('does not throw for id containing hyphens and underscores', () => {
    expect(() => validateStudyId('study-01_A')).not.toThrow();
  });

  it('does not throw for id at max length (64 chars)', () => {
    expect(() => validateStudyId('A'.repeat(64))).not.toThrow();
  });

  it('throws with statusCode 400 for empty string', () => {
    expect(() => validateStudyId('')).toThrow();
    try {
      validateStudyId('');
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
    }
  });

  it('throws with statusCode 400 when id exceeds 64 characters', () => {
    try {
      validateStudyId('A'.repeat(65));
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
      expect((e as Error).message).toMatch(/64/);
    }
  });

  it('throws with statusCode 400 for id containing spaces', () => {
    try {
      validateStudyId('study 01');
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
      expect((e as Error).message).toMatch(/invalid characters/i);
    }
  });

  it('throws with statusCode 400 for id containing dots', () => {
    try {
      validateStudyId('study.01');
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
    }
  });

  it('throws with statusCode 400 for id containing slashes', () => {
    try {
      validateStudyId('study/01');
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// getParticipantStats
// ---------------------------------------------------------------------------
describe('getParticipantStats', () => {
  it('returns rows from pool.query', async () => {
    const rows = [makeSummaryRow()];
    mockQuery.mockResolvedValueOnce({ rows } as never);

    const result = await getParticipantStats();
    expect(result).toEqual(rows);
  });

  it('passes studyId as query param when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await getParticipantStats('S1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE study_id = $1');
    expect(params).toEqual(['S1']);
  });

  it('passes no params and omits WHERE when studyId is undefined', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await getParticipantStats();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });

  it('throws DatabaseError when pool.query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down') as never);

    await expect(getParticipantStats()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('DatabaseError message references getParticipantStats', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout') as never);

    try {
      await getParticipantStats();
    } catch (e) {
      expect((e as Error).message).toContain('getParticipantStats');
    }
  });
});

// ---------------------------------------------------------------------------
// getGenderBreakdown
// ---------------------------------------------------------------------------
describe('getGenderBreakdown', () => {
  it('returns rows from pool.query', async () => {
    const rows = [makeGenderRow()];
    mockQuery.mockResolvedValueOnce({ rows } as never);

    expect(await getGenderBreakdown()).toEqual(rows);
  });

  it('passes studyId as query param when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await getGenderBreakdown('S1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE study_id = $1');
    expect(params).toEqual(['S1']);
  });

  it('throws DatabaseError when pool.query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error') as never);

    await expect(getGenderBreakdown()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('DatabaseError message references getGenderBreakdown', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout') as never);

    try {
      await getGenderBreakdown();
    } catch (e) {
      expect((e as Error).message).toContain('getGenderBreakdown');
    }
  });
});

// ---------------------------------------------------------------------------
// getSiteDistribution
// ---------------------------------------------------------------------------
describe('getSiteDistribution', () => {
  it('returns rows from pool.query', async () => {
    const rows = [makeSiteRow()];
    mockQuery.mockResolvedValueOnce({ rows } as never);

    expect(await getSiteDistribution()).toEqual(rows);
  });

  it('passes studyId as query param when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await getSiteDistribution('S1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE study_id = $1');
    expect(params).toEqual(['S1']);
  });

  it('throws DatabaseError when pool.query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error') as never);

    await expect(getSiteDistribution()).rejects.toBeInstanceOf(DatabaseError);
  });

  it('DatabaseError message references getSiteDistribution', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout') as never);

    try {
      await getSiteDistribution();
    } catch (e) {
      expect((e as Error).message).toContain('getSiteDistribution');
    }
  });
});

// ---------------------------------------------------------------------------
// Route handler: GET /participants/summary
// ---------------------------------------------------------------------------
describe('GET /participants/summary', () => {
  const setupMocks = (summaryRows: object[], genderRows: object[], siteRows: object[]) => {
    mockQuery
      .mockResolvedValueOnce({ rows: summaryRows } as never)
      .mockResolvedValueOnce({ rows: genderRows } as never)
      .mockResolvedValueOnce({ rows: siteRows } as never);
  };

  it('returns 200 with array of all studies', async () => {
    setupMocks(
      [makeSummaryRow({ study_id: 'S1' }), makeSummaryRow({ study_id: 'S2', study_name: 'Beta' })],
      [makeGenderRow({ study_id: 'S1' }), makeGenderRow({ study_id: 'S2' })],
      [makeSiteRow({ study_id: 'S1' }), makeSiteRow({ study_id: 'S2' })],
    );

    const res = await request(app).get('/participants/summary');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('attaches gender_breakdown and site_distribution to each study', async () => {
    setupMocks(
      [makeSummaryRow()],
      [makeGenderRow(), makeGenderRow({ gender: 'Male', count: 40 })],
      [makeSiteRow()],
    );

    const res = await request(app).get('/participants/summary');
    const study = res.body.data[0];
    expect(study.gender_breakdown).toHaveLength(2);
    expect(study.site_distribution).toHaveLength(1);
    // study_id is stripped from nested objects
    expect(study.gender_breakdown[0]).not.toHaveProperty('study_id');
    expect(study.site_distribution[0]).not.toHaveProperty('study_id');
  });

  it('includes executionTime and executionTimeSeconds in response', async () => {
    setupMocks([makeSummaryRow()], [makeGenderRow()], [makeSiteRow()]);

    const res = await request(app).get('/participants/summary');
    expect(res.body).toHaveProperty('executionTime');
    expect(res.body.executionTime).toMatch(/\d+ms/);
    expect(res.body).toHaveProperty('executionTimeSeconds');
  });
});

// ---------------------------------------------------------------------------
// Route handler: GET /participants/summary/:studyId
// ---------------------------------------------------------------------------
describe('GET /participants/summary/:studyId', () => {
  const setupMocks = (summaryRows: object[], genderRows: object[], siteRows: object[]) => {
    mockQuery
      .mockResolvedValueOnce({ rows: summaryRows } as never)
      .mockResolvedValueOnce({ rows: genderRows } as never)
      .mockResolvedValueOnce({ rows: siteRows } as never);
  };

  it('returns 200 with a single study object (not array)', async () => {
    setupMocks([makeSummaryRow()], [makeGenderRow()], [makeSiteRow()]);

    const res = await request(app).get('/participants/summary/S1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(res.body.data.study_id).toBe('S1');
  });

  it('returns 404 when study is not found', async () => {
    setupMocks([], [], []);

    const res = await request(app).get('/participants/summary/UNKNOWN');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(res.body.studyId).toBe('UNKNOWN');
  });

  it('returns 400 for studyId with invalid characters', async () => {
    const res = await request(app).get('/participants/summary/bad id!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request/i);
  });

  it('returns 400 for studyId longer than 64 characters', async () => {
    const longId = 'A'.repeat(65);
    const res = await request(app).get(`/participants/summary/${longId}`);
    expect(res.status).toBe(400);
  });

  it('returns 503 when a DatabaseError is thrown', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pg connection lost') as never);

    const res = await request(app).get('/participants/summary/S1');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/database query failed/i);
  });
});
