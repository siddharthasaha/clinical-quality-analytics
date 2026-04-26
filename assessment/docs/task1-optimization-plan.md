# Task 1 Optimization Plan — Clinical Quality Dashboard

> Derived from: [docs/performance-baseline.md](./performance-baseline.md)
> Date: 2026-04-25
> Environment: Docker Compose (local) — PostgreSQL 15 / Node.js / React

---

## 1. Purpose

This document defines the complete optimization plan for Task 1 of the clinical quality dashboard assessment. All targets and bottleneck descriptions are derived from actual measured baseline data.

👉 All optimization decisions are evidence-driven and based on observed performance characteristics.

---

## 2. Optimization Goals

| Goal                                    | Target                      | Basis                                     |
| --------------------------------------- | --------------------------- | ----------------------------------------- |
| Reduce `/api/studies/overview` TTFB     | < 50 ms                     | Eliminate 16-query N+1 + add indexes      |
| Reduce `/api/quality/distribution` TTFB | < 50 ms                     | Eliminate 21-query N+1 + add indexes      |
| Reduce query count per request          | 1 query each                | Collapse to single `GROUP BY` aggregation |
| Eliminate full table scans              | Index-assisted scans        | Add indexes on filter/join columns        |
| Fix `quality_score` TEXT cast           | Native numeric comparison   | Convert column type                       |
| UI: format quality scores               | 2 decimal places + % labels | Frontend formatting                       |

> Targets are set to achieve sub-100 ms perceived response time, aligning with standard UX performance expectations.

---

## Execution Order

1. Apply schema change (`quality_score` → NUMERIC)
2. Add indexes via migrations
3. Rewrite queries (collapse N+1)
4. Validate with EXPLAIN ANALYZE
5. Measure API performance (curl)
6. Apply UI improvements

---

## 3. Step-by-Step Implementation Plan

---

### Step 1 — Add Indexes (via Migration)

**File:** `database/migrations/001_add_indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_clinical_study_id
    ON clinical_data_raw (study_id);

CREATE INDEX IF NOT EXISTS idx_clinical_study_quality
    ON clinical_data_raw (study_id, quality_score);

CREATE INDEX IF NOT EXISTS idx_clinical_study_participant
    ON clinical_data_raw (study_id, participant_id);

CREATE INDEX IF NOT EXISTS idx_clinical_study_site
    ON clinical_data_raw (study_id, site_id);
```

**Reasoning:**

* Enables index-assisted filtering on `study_id`
* Improves aggregation performance for `COUNT(DISTINCT ...)`
* Supports range queries on `quality_score`

👉 Indexes are applied **after bootstrap** to avoid slowing bulk data load.

---

### Step 2 — Fix N+1 Queries (`/api/quality/distribution`)

**File:** `api/src/routes/quality.routes.ts`

```sql
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
```

**Impact:**

* 21 queries → 1 query
* Single-pass aggregation

---

### Step 3 — Fix N+1 Queries (`/api/studies/overview`)

**File:** `api/src/routes/studies.routes.ts`

```sql
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
```

**Impact:**

* 16 queries → 1 query

---

### Step 4 — Convert `quality_score` to NUMERIC

```sql
SELECT COUNT(*) 
FROM clinical_data_raw 
WHERE quality_score !~ '^[0-9.]+$';
```

If safe:

```sql
ALTER TABLE clinical_data_raw
    ALTER COLUMN quality_score TYPE NUMERIC USING quality_score::NUMERIC;
```

---

### Step 5 — UI Improvements

| Issue            | Fix                              |
| ---------------- | -------------------------------- |
| Raw decimals     | `(score * 100).toFixed(1) + '%'` |
| No % context     | Show counts as `N (X.X%)`        |
| No loading state | Add spinner/skeleton             |
| No thresholds    | Add labels "High ≥ 90%"          |

---

### Step 6 — Validation (curl)

```bash
for i in {1..5}; do
  curl -s -o /dev/null -w \
  "run$i: ttfb=%{time_starttransfer}s total=%{time_total}s\n" \
  http://localhost:3000/api/studies/overview
done
```

---

### Step 7 — EXPLAIN ANALYZE Validation

```sql
EXPLAIN ANALYZE
SELECT COUNT(*) FROM clinical_data_raw WHERE study_id = 'CARDIO001';
```

Expected:

* Index Scan or Bitmap Heap Scan
* Reduced execution time

---

## 5. Before / After Measurement Plan

| Endpoint     | Before | After | Target |
| ------------ | ------ | ----- | ------ |
| Overview     | 744 ms | ___   | <50 ms |
| Distribution | 455 ms | ___   | <50 ms |

---

## 6. Risks and Tradeoffs

| Risk                    | Mitigation                         |
| ----------------------- | ---------------------------------- |
| Dirty data cast failure | Validate before migration          |
| Index overhead          | Acceptable for read-heavy workload |
| Query behavior change   | Validate with EXPLAIN              |

---

## 7. Definition of Done

* [ ] Indexes applied via migration
* [ ] Queries reduced to 1 per endpoint
* [ ] TTFB < 50 ms
* [ ] EXPLAIN shows index usage
* [ ] UI improvements applied

---

## 8. Git Commit Plan

```
feat: add DB indexes via migration
perf: collapse N+1 queries
fix: convert quality_score to NUMERIC
feat: UI formatting improvements
docs: update performance baseline
```

---

## 9. AI Prompt Log — Task 1 Optimization Plan

### Objective

Use AI to synthesize baseline findings into structured plan.

### Prompt Used

(Full prompt included)

### How Output Was Used

Applied as implementation guide.

### Validation Approach

* curl timing
* EXPLAIN ANALYZE
* API executionTime field

---
