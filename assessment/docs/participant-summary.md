# Summary of Changes: `participant-summary`

| # | Commit message |
|---|---|
| 1 | Add participant summary report with aggregated API, gender/site breakdowns, and shareable study routes |
| 2 | Added exception handling |
| 3 | Added unit test for api under `api/src/routes/__tests__` |
| 4 | Created frontend components |
| 5 | Added a GitHub Actions CI workflow to run tests on push |

---

## Backend Changes

### New — `assessment/api/src/routes/participants.routes.ts` (+267)

New Express route module for `GET /api/participants/summary` and `GET /api/participants/summary/:studyId`.

- **`DatabaseError`** class — wraps PostgreSQL errors with query context and preserves the original cause
- **`validateStudyId`** — input validation (alphanumeric/hyphen/underscore, max 64 chars); throws with `statusCode: 400` on invalid input
- **`studyFilter`** / **`queryParams`** — helpers that inject an optional `WHERE study_id = $1` clause
- **`getParticipantStats`** — two-level CTE query: deduplicates at participant level first, then aggregates avg/min/max age, total participants, and avg measurements per participant per study
- **`getGenderBreakdown`** — distinct participant count by gender per study
- **`getSiteDistribution`** — distinct participant count by site per study
- **Route handler** — runs all three queries in parallel via `Promise.all`, merges results, returns single object or array depending on whether `studyId` is present
- **Error handling** — discriminates `400` (validation), `503` (DatabaseError), `500` (unexpected)

### Modified — `assessment/api/src/routes/index.ts` (+2)

Registered the new participants route:
```typescript
import participantsRoutes from './participants.routes';
router.use('/participants', participantsRoutes);
```

### API Surface Added

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/participants/summary` | All studies — returns array |
| `GET` | `/api/participants/summary/:studyId` | Single study — returns object, 404 if not found |

#### Response shape
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

---

## Frontend Changes

### New — `assessment/frontend/src/components/ParticipantSummary.tsx` (+270)

A self-contained React page component that renders the full participant summary for a selected study.

**Data fetching**
- Calls `GET /api/participants/summary` once on mount and stores all study data in local state.
- Auto-selects the first study if none is pre-selected via props.
- Displays a full-screen spinner while loading and an error card if the request fails.

**Study selector**
- Dropdown listing every study returned by the API (`study_name (study_id)` format).
- Changing selection instantly re-renders all cards and charts without a new network request.

**Stat cards (8 cards in a responsive grid)**

| Card | Value shown |
|------|-------------|
| Total Participants | Formatted integer |
| Avg Age | `X yrs` |
| Age Range | `min–max yrs` |
| Avg Measurements / Participant | Formatted number |
| Data Start | Localised date string |
| Data End | Localised date string |
| Sites | Count of distinct sites |
| Gender Groups | Count of distinct gender values |

**Gender breakdown panel**
- Recharts `PieChart` with percentage labels on each slice and a colour legend.
- Percentage table below the chart showing each gender, raw participant count, and `%` share.
- Five preset colours (`#3b82f6`, `#ec4899`, `#8b5cf6`, `#10b981`, `#f59e0b`) cycle for additional groups.

**Site distribution table**
- Lists every site with name, location, participant count, and share `%` of the study total.

**Shareable URL**
- Displays a copyable link in the format `{origin}/?page=participants&study={studyId}`.
- One-click **Copy** button writes the URL to the clipboard via `navigator.clipboard`.

### Modified — `assessment/frontend/src/App.tsx` (+69 / -30)

| Change | Detail |
|--------|--------|
| New `Page` value | Added `'participants'` to the `Page` union type |
| Deep-link support | `getInitialState()` reads `?page=` and `?study=` query params on first render so shared URLs open the correct page and study |
| URL sync | `useEffect` calls `window.history.replaceState` whenever `currentPage` or `participantStudyId` changes, keeping the address bar in sync without a full navigation |
| Nav item | Added **Participant Summary** button to the header alongside Study Overview and Quality Dashboard |
| Study state | New `participantStudyId` state is passed as `initialStudyId` and updated via `onStudyChange` callback on the component |

### Modified — `assessment/frontend/src/types.ts` (+32)

Four new TypeScript interfaces added to support the participant summary API response:

```typescript
interface GenderBreakdown {
  gender: string;
  count: number;
}

interface SiteDistribution {
  site_id: string;
  site_name: string;
  site_location: string;
  participant_count: number;
}

interface ParticipantSummary {
  study_id: string;
  study_name: string;
  total_participants: number;
  avg_age: number;
  min_age: number;
  max_age: number;
  avg_measurements_per_participant: number;
  data_start_date: string;
  data_end_date: string;
  gender_breakdown: GenderBreakdown[];
  site_distribution: SiteDistribution[];
}

interface ParticipantSummaryResponse {
  data: ParticipantSummary[];
  executionTime: string;
  executionTimeSeconds: string;
}
```

---

## Test Changes

### New — `assessment/api/src/routes/__tests__/participants.routes.test.ts` (+409)

Jest unit test suite — 41 tests across 8 describe blocks. `pool.query` is mocked via `jest.mock('../../db')` — no live database required.

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

### Modified — `assessment/api/package.json` (+26 / -3)

- Added `test`, `test:watch`, `test:coverage` scripts
- Added `jest` configuration block (`preset: ts-jest`, `testEnvironment: node`)
- Added dev dependencies: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`

### Modified — `assessment/api/tsconfig.json` (+1 / -1)

Excluded test files from the production TypeScript build:
```json
"exclude": ["node_modules", "src/**/*.test.ts", "src/**/__tests__"]
```

### Modified — `assessment/api/package-lock.json` (+7,087)

Generated lockfile for the newly added Jest/supertest dev dependencies.

---

## CI Changes

### New — `.github/workflows/ci.yml`

GitHub Actions workflow that runs the Jest test suite on every push and pull request to any branch.

```
push / pull_request (opened, synchronize, reopened) → ubuntu-latest → npm ci → npm test
```

If any test fails, the workflow step exits non-zero and the CI check fails.

### Viewing test progress on GitHub

**Browsing runs**
1. Open the repository on GitHub.
2. Click the **Actions** tab in the top navigation bar.
3. In the left sidebar, select the **CI** workflow.
4. All recent runs are listed with branch name, commit message, trigger, and status badge.
5. Click any run, then click the **API Tests** job to expand the step-by-step log.

**Checking status on a Pull Request**
1. Open the pull request on GitHub.
2. Scroll to the **Checks** section near the merge button.
3. The **CI / API Tests** check is listed with its current status.
4. Click **Details** to jump directly to the live log.

**Status badges**

| Badge | Meaning |
|---|---|
| Yellow / spinning | Workflow is queued or running |
| Green checkmark | All tests passed |
| Red ✕ | One or more tests failed — click Details to see the full Jest output |

**Re-running a failed workflow**
1. Open the failed run from the **Actions** tab.
2. Click **Re-run all jobs** to retry the exact same commit.
3. Or click **Re-run failed jobs** to re-run only the failed jobs.
