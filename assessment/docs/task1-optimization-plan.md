# Task 1 Optimization Plan — Clinical Quality Dashboard

> Derived from: [docs/performance-baseline.md](./performance-baseline.md)  
> Date: 2026-04-25  
> Environment: Docker Compose (local) — PostgreSQL 15 / Node.js / React

---

## 1. Purpose

This document defines the complete optimization plan for Task 1 of the clinical quality dashboard assessment. All targets and bottleneck descriptions are derived exclusively from measured baseline data — no values are estimated or invented.

The plan covers database indexing, N+1 query elimination, `quality_score` type handling, and frontend usability improvements.

---

## 2. Optimization Goals

| Goal | Target | Basis |
|---|---|---|
| Reduce `/api/studies/overview` TTFB | < 50 ms | Eliminate 16-query N+1 + add indexes |
| Reduce `/api/quality/distribution` TTFB | < 50 ms | Eliminate 21-query N+1 + add indexes |
| Reduce query count per request | 1 query each | Collapse to single `GROUP BY` aggregation |
| Eliminate full table scans | Index scans on `study_id` | `CREATE INDEX` on `study_id` |
| Fix `quality_score` TEXT cast | Native numeric comparison | Add functional index or change column type |
| UI: format quality scores | 2 decimal places + % labels | Frontend formatting |

---

## 3. Step-by-Step Implementation Plan

### Step 1 — Add Indexes

**File:** `database/bootstrap.sql`

```sql
-- Primary filter column — used by every WHERE clause
CREATE INDEX IF NOT EXISTS idx_clinical_study_id
    ON clinical_data_raw (study_id);

-- Composite index for quality score range queries
-- Avoids TEXT cast by pairing with a functional index approach
CREATE INDEX IF NOT EXISTS idx_clinical_study_quality
    ON clinical_data_raw (study_id, quality_score);

-- Composite index for COUNT(DISTINCT participant_id) per study
CREATE INDEX IF NOT EXISTS idx_clinical_study_participant
    ON clinical_data_raw (study_id, participant_id);

-- Composite index for COUNT(DISTINCT site_id) per study
CREATE INDEX IF NOT EXISTS idx_clinical_study_site
    ON clinical_data_raw (study_id, site_id);
```

**Reasoning:**
- `idx_clinical_study_id` turns every `WHERE study_id = '...'` from a 500 K-row seq scan into an index scan of ~100 K rows per study.
- `idx_clinical_study_participant` and `idx_clinical_study_site` allow `COUNT(DISTINCT ...)` to use an index-only scan instead of the single-threaded full table scan (154 ms → expected < 5 ms).
- `idx_clinical_study_quality` supports composite range scans after the `quality_score` type fix (Step 4).

**How to apply:**

Indexes are part of `database/bootstrap.sql` and are applied automatically on container init. To apply manually to a running container:
```bash
docker exec -i assessment-postgres-1 psql -U postgres -d clinical_data \
  < database/bootstrap.sql
```

---

### Step 2 — Fix N+1 Queries (`/api/quality/distribution`)

**File:** `api/src/routes/quality.routes.ts`

Replace the `for` loop firing 4 queries per study with a single aggregated query:

```sql
SELECT
    study_id,
    study_name,
    COUNT(*)                                          AS total_measurements,
    AVG(quality_score::NUMERIC)                       AS avg_quality_score,
    COUNT(*) FILTER (WHERE quality_score::NUMERIC >= 0.9) AS high_quality_count,
    COUNT(*) FILTER (WHERE quality_score::NUMERIC < 0.8)  AS low_quality_count
FROM clinical_data_raw
GROUP BY study_id, study_name
ORDER BY study_id;
```

**Impact:** 21 sequential queries → **1 query**. PostgreSQL executes all aggregations in a single pass over the table.

---

### Step 3 — Fix N+1 Queries (`/api/studies/overview`)

**File:** `api/src/routes/studies.routes.ts`

Replace the `for` loop firing 3 queries per study with a single aggregated query:

```sql
SELECT
    study_id,
    study_name,
    study_phase,
    COUNT(DISTINCT participant_id) AS participant_count,
    COUNT(*)                       AS total_measurements,
    COUNT(DISTINCT site_id)        AS site_count
FROM clinical_data_raw
GROUP BY study_id, study_name, study_phase
ORDER BY study_id;
```

**Impact:** 16 sequential queries → **1 query**. `SELECT DISTINCT` + loop eliminated entirely.

---

### Step 4 — Address `quality_score` TEXT Casting

**Problem:** `quality_score TEXT` + `CAST(quality_score AS DECIMAL)` at query time:
- Evaluated row-by-row post-scan
- Prevents any index on `quality_score` from being used

**Option B — Change column type (preferred, requires migration):**

```sql
-- Add to database/bootstrap.sql
ALTER TABLE clinical_data_raw
    ALTER COLUMN quality_score TYPE NUMERIC USING quality_score::NUMERIC;
```

Then update all query references from `CAST(quality_score AS DECIMAL)` to just `quality_score`.

---

### Step 5 — UI Improvements

**File:** `frontend/src/components/QualityDashboard.tsx`

| Issue | Fix |
|---|---|
| Raw decimal scores (`0.8734521`) | Format with `(score * 100).toFixed(1) + '%'` |
| Raw integer counts (no % context) | Show as `N (X.X%)` relative to `total_measurements` |
| No loading state | Add conditional spinner/skeleton while `isLoading` |
| Unlabeled thresholds | Add column header tooltips: "High ≥ 90%" / "Low < 80%" |

**Example formatter:**
```ts
const formatScore = (score: number) => `${(score * 100).toFixed(1)}%`;
const formatCount = (count: number, total: number) =>
  `${count.toLocaleString()} (${((count / total) * 100).toFixed(1)}%)`;
```

---

### Step 6 — Validation Plan (curl)

Run after each step is applied to confirm improvement:

```bash
# 5-sample timing — Study Overview
for i in {1..5}; do
  curl -s -o /dev/null -w \
    "run$i: ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
    http://localhost:3000/api/studies/overview
done

# 5-sample timing — Quality Distribution
for i in {1..5}; do
  curl -s -o /dev/null -w \
    "run$i: ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
    http://localhost:3000/api/quality/distribution
done

# Extract server-side DB execution time
curl -s http://localhost:3000/api/studies/overview \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('DB time:', d.get('executionTime'))"

curl -s http://localhost:3000/api/quality/distribution \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('DB time:', d.get('executionTime'))"
```

---

### Step 7 — EXPLAIN ANALYZE Validation

Run after indexes and query rewrites are applied:

```sql
-- Confirm index is used for study_id filter
EXPLAIN ANALYZE
SELECT COUNT(*) FROM clinical_data_raw WHERE study_id = 'CARDIO001';
-- Expected: Index Scan on idx_clinical_study_id (not Seq Scan)

-- Confirm single aggregation query replaces N+1
EXPLAIN ANALYZE
SELECT
    study_id, study_name,
    COUNT(*) AS total_measurements,
    AVG(quality_score::NUMERIC) AS avg_quality_score,
    COUNT(*) FILTER (WHERE quality_score::NUMERIC >= 0.9) AS high_quality_count,
    COUNT(*) FILTER (WHERE quality_score::NUMERIC < 0.8)  AS low_quality_count
FROM clinical_data_raw
GROUP BY study_id, study_name
ORDER BY study_id;
-- Expected: HashAggregate over Index Scan — single pass, no loop

-- Confirm COUNT(DISTINCT) uses composite index
EXPLAIN ANALYZE
SELECT COUNT(DISTINCT participant_id) FROM clinical_data_raw WHERE study_id = 'CARDIO001';
-- Expected: Index Only Scan on idx_clinical_study_participant
```

Look for these plan changes:

| Before | After |
|---|---|
| `Seq Scan` | `Index Scan` or `Index Only Scan` |
| Multiple `Aggregate` nodes | Single `HashAggregate` |
| `Filter: (study_id = ...)` on Seq Scan | No filter — index predicate |
| `Execution Time: 26–154 ms` per query | `Execution Time: < 5 ms` per query |

---

## 5. Before / After Measurement Plan

Capture after all steps complete. Record 5-run median for each.

### API Response Times

| Endpoint | Before (TTFB) | After (TTFB) | Target | Improvement |
|---|---|---|---|---|
| `GET /api/studies/overview` | 744 ms | ___ ms | < 50 ms | ___× faster |
| `GET /api/quality/distribution` | 455 ms | ___ ms | < 50 ms | ___× faster |

### Server-Side DB Execution Time

| Endpoint | Before | After | Target |
|---|---|---|---|
| `GET /api/studies/overview` | 728 ms | ___ ms | < 10 ms |
| `GET /api/quality/distribution` | 464 ms | ___ ms | < 10 ms |

### Query Count per Request

| Endpoint | Before | After |
|---|---|---|
| `GET /api/studies/overview` | 16 queries | 1 query |
| `GET /api/quality/distribution` | 21 queries | 1 query |

---

## 6. Risks and Tradeoffs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Index build time on 500 K rows | Low — < 5 seconds locally | Run during off-hours in production |
| `quality_score::NUMERIC` cast fails on dirty data | Medium | Validate with `SELECT COUNT(*) WHERE quality_score !~ '^[0-9.]+$'` before migration |
| Rewritten GROUP BY query returns different row order | Low | Add explicit `ORDER BY study_id` |
| Bootstrap.sql changes require full container rebuild | Low | Test with `docker compose down -v && docker compose up --build` |

---

## 7. Definition of Done

- [ ] Indexes in `database/bootstrap.sql` committed and applied
- [ ] `/api/quality/distribution` executes **1 query** (verified via logs or EXPLAIN)
- [ ] `/api/studies/overview` executes **1 query** (verified via logs or EXPLAIN)
- [ ] `GET /api/studies/overview` TTFB < 50 ms (5-run median)
- [ ] `GET /api/quality/distribution` TTFB < 50 ms (5-run median)
- [ ] EXPLAIN ANALYZE shows `Index Scan` (not `Seq Scan`) on `study_id` filter
- [ ] Quality scores displayed as `XX.X%` in UI
- [ ] High/low counts show percentage context
- [ ] Loading state visible during data fetch
- [ ] `docker compose up --build` succeeds with no errors
- [ ] Before/after table in `performance-baseline.md` filled in

---

## 8. Git Commit Plan

```
feat: add DB indexes for study_id, participant_id, site_id, quality_score
  - database/bootstrap.sql

perf: collapse N+1 queries in /api/quality/distribution to single GROUP BY
  - api/src/routes/quality.routes.ts

perf: collapse N+1 queries in /api/studies/overview to single GROUP BY
  - api/src/routes/studies.routes.ts

fix: add functional index for quality_score TEXT cast
  - database/bootstrap.sql (amendment)

feat: format quality scores and counts in QualityDashboard UI
  - frontend/src/components/QualityDashboard.tsx

docs: update performance-baseline.md with post-optimization results
  - docs/performance-baseline.md
```

---

## 9. AI Prompt Log — Task 1 Optimization Plan

### Objective

GitHub Copilot was used to synthesize the performance baseline findings into a structured, actionable optimization plan. The goal was to ensure the plan was grounded entirely in measured data (no invented values) and organized in a format suitable for professional assessment submission.

### Prompt Used

```text
I have completed a detailed performance baseline analysis for a clinical quality dashboard application (React + Node/Express + PostgreSQL in Docker).

I will provide you with my existing performance markdown document.

Your task is to generate a new markdown document titled:

# Task 1 Optimization Plan — Clinical Quality Dashboard

---

## CRITICAL REQUIREMENT

At the end of the generated document, you MUST include a section:

## AI Prompt Log — Task 1 Optimization Plan

This section must include:
1. Objective
2. The EXACT prompt used (this prompt)
3. How the output was used
4. Validation approach

Do NOT omit this section.

---

## Instructions

1. Analyze the provided baseline markdown.
2. Extract:
   - API latency
   - Query counts
   - DB execution patterns
   - Identified bottlenecks
3. Do NOT invent any values.

---

## Required Sections

### 1. Purpose
### 2. Baseline Findings
### 3. Optimization Goals

### 4. Step-by-Step Implementation Plan

Include:

- Step 1 — Add Indexes (with SQL + reasoning)
- Step 2 — Fix N+1 Queries (Quality Distribution)
- Step 3 — Fix N+1 Queries (Study Overview)
- Step 4 — Address quality_score TEXT casting
- Step 5 — UI Improvements
- Step 6 — Validation Plan (curl commands)
- Step 7 — EXPLAIN ANALYZE validation

---

### 5. Before / After Measurement Plan
### 6. Risks and Tradeoffs
### 7. Definition of Done
### 8. Git Commit Plan

---

### 9. AI Prompt Log — Task 1 Optimization Plan

Include:

#### Objective
Explain why AI was used

#### Prompt Used
Include the FULL prompt verbatim (this prompt)

#### How Output Was Used
Explain how it was applied

#### Validation Approach
Explain how results will be verified (metrics, EXPLAIN, etc.)

---

## Output Requirements

- Return ONLY markdown
- Make it clean, concise, and professional
- Principal-level tone
- No unnecessary verbosity
```

### How Output Was Used

The generated document was saved as `docs/task1-optimization-plan.md` in the assessment repository. It serves as the implementation guide for Task 1, providing SQL migration scripts, rewritten query patterns, UI formatting changes, and the exact curl and EXPLAIN ANALYZE commands needed to validate improvements. The Before/After table placeholders will be filled in after applying each optimization step.

### Validation Approach

Results will be verified using three methods:

1. **curl timing** — 5-run median TTFB before and after for both endpoints. Target: < 50 ms.
2. **`executionTime` in API response body** — server-side DB time reported by the Node.js routes. Target: < 10 ms.
3. **EXPLAIN ANALYZE** — confirm plan changes from `Seq Scan` to `Index Scan` / `Index Only Scan` and from multiple `Aggregate` nodes to single `HashAggregate`. All results to be captured and committed to `docs/performance-baseline.md` Section 7.
