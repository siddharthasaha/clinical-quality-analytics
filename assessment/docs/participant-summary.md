# Branch Changes: `participant-summary`

## Commits

| # | SHA | Message |
|---|-----|---------|
| 1 | `1636b85` | Add participant summary report with aggregated API, gender/site breakdowns, and shareable study routes |
| 2 | `7422e5f` | Added exception handling and test |
| 3 | `72c666b` | Added a GitHub Actions CI workflow to run tests on push |
| 4 | `94a8a10` | Moved the workflow file one level up to repo root |

---

## Files Changed (10 files, +8,134 / -30 lines)

### New Files

#### `assessment/api/src/routes/participants.routes.ts` (+267)
New Express route module for `GET /api/participants/summary` and `GET /api/participants/summary/:studyId`.

- **`DatabaseError`** class — wraps PostgreSQL errors with query context and preserves the original cause
- **`validateStudyId`** — input validation (alphanumeric/hyphen/underscore, max 64 chars); throws with `statusCode: 400` on invalid input
- **`studyFilter`** / **`queryParams`** — helpers that inject an optional `WHERE study_id = $1` clause
- **`getParticipantStats`** — two-level CTE query: deduplicates at participant level first, then aggregates avg/min/max age, total participants, and avg measurements per participant per study
- **`getGenderBreakdown`** — distinct participant count by gender per study
- **`getSiteDistribution`** — distinct participant count by site per study
- **Route handler** — runs all three queries in parallel via `Promise.all`, merges results, returns single object or array depending on whether `studyId` is present
- **Error handling** — discriminates `400` (validation), `503` (DatabaseError), `500` (unexpected)

#### `assessment/api/src/routes/__tests__/participants.routes.test.ts` (+409)
Jest unit test suite — 41 tests across 8 describe blocks.

| Suite | Tests |
|-------|-------|
| `DatabaseError` | name, message format, non-Error cause, cause preservation |
| `studyFilter` | with/without studyId |
| `queryParams` | with/without studyId |
| `validateStudyId` | valid IDs, empty, >64 chars, spaces, dots, slashes |
| `getParticipantStats` | rows returned, WHERE injection, empty params, DatabaseError wrapping |
| `getGenderBreakdown` | same pattern |
| `getSiteDistribution` | same pattern |
| `GET /participants/summary` | 200 array, nested breakdown, timing fields |
| `GET /participants/summary/:studyId` | 200 single object, 404, 400 invalid, 503 DB error |

`pool.query` is mocked via `jest.mock('../../db')` — no database required.

#### `assessment/frontend/src/components/ParticipantSummary.tsx` (+270)
New React component for the Participant Summary Report page.

- Fetches all study data once from `/api/participants/summary`
- Study selector dropdown
- 8 stat cards: total participants, avg/min/max age, avg measurements per participant, data start/end date, site count, gender groups
- Pie chart (Recharts) + percentage table for gender breakdown
- Site distribution table with participant counts and share %
- Shareable URL display (`?page=participants&study=<id>`) with one-click copy button
- Loading spinner and error state

#### `.github/workflows/ci.yml` (new)
GitHub Actions workflow that runs the Jest test suite on every push and pull request to any branch.

```
push / pull_request → ubuntu-latest → npm ci → npm test --ci --forceExit
```

If any test fails, the workflow step exits non-zero and the CI check fails.

---

### Modified Files

#### `assessment/api/src/routes/index.ts` (+2)
Registered the new participants route:
```typescript
import participantsRoutes from './participants.routes';
router.use('/participants', participantsRoutes);
```

#### `assessment/frontend/src/App.tsx` (+69 / -30)
- Added `'participants'` to the `Page` type
- Reads `?page=` and `?study=` query params on initial load for deep-link / shareable URL support
- Keeps URL in sync with current page and selected study via `window.history.replaceState`
- Added **Participant Summary** nav item to the header

#### `assessment/frontend/src/types.ts` (+32)
Added four new TypeScript interfaces:

```typescript
GenderBreakdown        // { gender, count }
SiteDistribution       // { site_id, site_name, site_location, participant_count }
ParticipantSummary     // full per-study aggregate shape
ParticipantSummaryResponse  // { data, executionTime, executionTimeSeconds }
```

#### `assessment/api/package.json` (+26 / -3)
- Added `test`, `test:watch`, `test:coverage` scripts
- Added `jest` configuration block (`preset: ts-jest`, `testEnvironment: node`)
- Added dev dependencies: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`

#### `assessment/api/tsconfig.json` (+1 / -1)
Excluded test files from the production TypeScript build:
```json
"exclude": ["node_modules", "src/**/*.test.ts", "src/**/__tests__"]
```

#### `assessment/api/package-lock.json` (+7,087)
Generated lockfile for the newly added Jest/supertest dev dependencies.

---

## API Surface Added

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/participants/summary` | All studies — returns array |
| `GET` | `/api/participants/summary/:studyId` | Single study — returns object, 404 if not found |

### Response shape
```json
{
  "data": {
    "study_id": "string",
    "study_name": "string",
    "total_participants": 0,
    "avg_age": 0.0,
    "min_age": 0,
    "max_age": 0,
    "avg_measurements_per_participant": 0.0,
    "data_start_date": "ISO timestamp",
    "data_end_date": "ISO timestamp",
    "gender_breakdown": [{ "gender": "string", "count": 0 }],
    "site_distribution": [{ "site_id": "string", "site_name": "string", "site_location": "string", "participant_count": 0 }]
  },
  "executionTime": "123ms",
  "executionTimeSeconds": 0.123
}
```
