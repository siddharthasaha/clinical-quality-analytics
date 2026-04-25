
# Performance Baseline — Clinical Quality Dashboard

> This document was generated with AI assistance. See [Section 17 — AI Prompt Log](#17-ai-prompt-log--traceability--validation) for the exact prompt used.

---

## 1. Environment

| Property | Value |
|---|---|
| **Date captured** | 2026-04-25 |
| **OS** | macOS |
| **Runtime** | Docker Compose (local) |
| **DB state** | Warm — measured after initial seed completed |
| **API** | Node.js / Express / TypeScript — `http://localhost:3000` |
| **Frontend** | React / Vite / TypeScript — `http://localhost:5173` |
| **Database** | PostgreSQL (in container) — `localhost:5432 / clinical_data` |
| **Dataset size** | ~500 K rows, single table `clinical_data_raw` |

### Table Schema (`clinical_data_raw`)

```sql
CREATE TABLE clinical_data_raw (
    id                          SERIAL PRIMARY KEY,
    study_id                    TEXT,
    study_name                  TEXT,
    study_start_date            TEXT,
    study_phase                 TEXT,
    participant_id              TEXT,
    participant_name            TEXT,
    participant_dob              TEXT,
    participant_gender          TEXT,
    participant_enrollment_date TEXT,
    site_id                     TEXT,
    site_name                   TEXT,
    site_location               TEXT,
    site_coordinator            TEXT,
    measurement_type            TEXT,
    measurement_value           TEXT,
    measurement_unit            TEXT,
    measurement_timestamp       TEXT,
    quality_score               TEXT,   -- ⚠ stored as TEXT, cast at query time
    quality_flags               TEXT,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- No indexes defined beyond the primary key.
```

---

## 2. Baseline Test Steps

### Step 1 — Confirm services are running

```bash
curl http://localhost:3000/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### Step 2 — Single-shot timing (any endpoint)

```bash
curl -s -o /dev/null -w \
  "ttfb: %{time_starttransfer}s | total: %{time_total}s | size: %{size_download}B\n" \
  <URL>
```

### Step 3 — Run N samples for a stable median

```bash
# Quality Distribution (the primary slow endpoint)
for i in {1..5}; do
  curl -s -o /dev/null -w \
    "run$i: ttfb=%{time_starttransfer}s  total=%{time_total}s  size=%{size_download}B\n" \
    http://localhost:3000/api/quality/distribution
done

# Study Overview
for i in {1..5}; do
  curl -s -o /dev/null -w \
    "run$i: ttfb=%{time_starttransfer}s  total=%{time_total}s  size=%{size_download}B\n" \
    http://localhost:3000/api/studies/overview
done
```

### Step 4 — Save response body and inspect payload

```bash
# Quality Distribution
curl -s -o /tmp/quality.json -w \
  "ttfb: %{time_starttransfer}s | total: %{time_total}s | size: %{size_download}B\n" \
  http://localhost:3000/api/quality/distribution

wc -c < /tmp/quality.json | awk '{printf "%.2f KB\n", $1/1024}'  # payload size
jq '{executionTime, executionTimeSeconds}' /tmp/quality.json       # server-side DB time

# Study Overview
curl -s -o /tmp/overview.json -w \
  "ttfb: %{time_starttransfer}s | total: %{time_total}s | size: %{size_download}B\n" \
  http://localhost:3000/api/studies/overview

wc -c < /tmp/overview.json | awk '{printf "%.2f KB\n", $1/1024}'
jq '{executionTime, executionTimeSeconds}' /tmp/overview.json
```

### curl Write-Out Fields Reference

| Field | Meaning |
|---|---|
| `%{time_namelookup}` | DNS resolution time |
| `%{time_connect}` | TCP handshake complete |
| `%{time_starttransfer}` | **Time to first byte (TTFB)** — best proxy for server + DB latency |
| `%{time_total}` | Full round-trip including download |
| `%{size_download}` | Response payload in bytes |
| `%{speed_download}` | Download throughput (B/s) |

> **Tip:** TTFB ≈ Total for these endpoints because payloads are under 1 KB. Use TTFB as the primary diagnostic metric — it isolates server and DB time from transfer overhead.

---

## 3. API Response Times

Measured: 2026-04-25 | 3 warm runs each (cold-start run excluded)

| Endpoint | TTFB (median) | Total (median) | Payload | Server DB Time |
|---|---|---|---|---|
| `GET /health` | 2 ms | 2 ms | 59 B | N/A |
| `GET /api/studies/overview` | **~744 ms** | ~744 ms | 867 B | 728 ms |
| `GET /api/quality/distribution` | **~455 ms** | ~455 ms | 962 B | 464 ms |

### Raw Sample Output

```
=== GET /health ===
  run1: ttfb=0.002592s  total=0.002675s  size=59B
  run2: ttfb=0.001846s  total=0.001897s  size=59B
  run3: ttfb=0.002127s  total=0.002312s  size=59B

=== GET /api/studies/overview ===
  run1: ttfb=0.787352s  total=0.787438s  size=867B
  run2: ttfb=0.726890s  total=0.727342s  size=867B
  run3: ttfb=0.717905s  total=0.718100s  size=867B

=== GET /api/quality/distribution ===
  run1: ttfb=0.458458s  total=0.458633s  size=962B
  run2: ttfb=0.452209s  total=0.452384s  size=962B
  run3: ttfb=0.455515s  total=0.455776s  size=962B
```

---

## 4. Database Query Performance

### How to Connect

```bash
# From the host machine (requires psql client)
psql -h localhost -p 5432 -U postgres -d clinical_data

# Or via Docker exec
docker exec -it <postgres_container_name> psql -U postgres -d clinical_data
```

### Step 1 — Confirm study IDs in the database

```sql
SELECT DISTINCT study_id, study_name FROM clinical_data_raw ORDER BY study_id;
```

Use the returned `study_id` values in place of `'<study_id>'` in the EXPLAIN ANALYZE commands below.

---

### EXPLAIN ANALYZE — `GET /api/quality/distribution`

This endpoint fires **21 sequential queries** (1 + 5 studies × 4 queries each). Run EXPLAIN ANALYZE on each query pattern:

```sql
-- Query 1: fetch distinct studies (fires once)
EXPLAIN ANALYZE
SELECT DISTINCT study_id, study_name
FROM clinical_data_raw
ORDER BY study_id;

-- Query 2: total measurement count per study (fires 5×)
EXPLAIN ANALYZE
SELECT COUNT(*) AS total_measurements
FROM clinical_data_raw
WHERE study_id = '<study_id>';

-- Query 3: average quality score per study (fires 5×)
-- ⚠ CAST on TEXT column prevents index use
EXPLAIN ANALYZE
SELECT AVG(CAST(quality_score AS DECIMAL)) AS avg_quality_score
FROM clinical_data_raw
WHERE study_id = '<study_id>';

-- Query 4: high-quality count per study (fires 5×)
-- ⚠ CAST on TEXT column prevents index use
EXPLAIN ANALYZE
SELECT COUNT(*) AS high_quality_count
FROM clinical_data_raw
WHERE study_id = '<study_id>'
  AND CAST(quality_score AS DECIMAL) >= 0.9;

-- Query 5: low-quality count per study (fires 5×)
-- ⚠ CAST on TEXT column prevents index use
EXPLAIN ANALYZE
SELECT COUNT(*) AS low_quality_count
FROM clinical_data_raw
WHERE study_id = '<study_id>'
  AND CAST(quality_score AS DECIMAL) < 0.8;
```

---

### EXPLAIN ANALYZE — `GET /api/studies/overview`

This endpoint fires **16 sequential queries** (1 + 5 studies × 3 queries each):

```sql
-- Query 1: fetch distinct studies (fires once)
EXPLAIN ANALYZE
SELECT DISTINCT study_id, study_name, study_phase
FROM clinical_data_raw
ORDER BY study_id;

-- Query 2: distinct participant count per study (fires 5×)
EXPLAIN ANALYZE
SELECT COUNT(DISTINCT participant_id) AS participant_count
FROM clinical_data_raw
WHERE study_id = '<study_id>';

-- Query 3: total measurement count per study (fires 5×)
EXPLAIN ANALYZE
SELECT COUNT(*) AS total_measurements
FROM clinical_data_raw
WHERE study_id = '<study_id>';

-- Query 4: distinct site count per study (fires 5×)
EXPLAIN ANALYZE
SELECT COUNT(DISTINCT site_id) AS site_count
FROM clinical_data_raw
WHERE study_id = '<study_id>';
```

---

### What to Look for in EXPLAIN ANALYZE Output

| Output term | What it signals |
|---|---|
| `Seq Scan` | Full table scan — no index available or used |
| `cost=0.00..NNNN` | Estimated query cost (higher = slower) |
| `actual time=N..M` | Real execution time in milliseconds |
| `rows=N` | Rows processed at this node |
| `Filter:` on a `Seq Scan` | Predicate applied after reading all rows — index needed |
| `Planning Time` | Time PostgreSQL spent choosing a query plan |
| `Execution Time` | Actual wall-clock time for the query |

**Expected finding:** All queries will show `Seq Scan` on `clinical_data_raw` (500 K rows) because no indexes exist on `study_id` or `quality_score`.

---

## 5. Frontend Observations

Observed by loading `http://localhost:5173` before any optimization:

| Issue | Dashboard | Observation |
|---|---|---|
| **Slow initial load** | Quality Dashboard | Spinner visible for 400–800 ms after page open; perceived as "frozen" by users |
| **Raw decimal scores** | Quality Dashboard | Quality scores shown as e.g. `0.8734521` — hard to read at a glance |
| **No percentage formatting** | Quality Dashboard | High/low quality counts shown as raw integers with no % context |
| **Unlabeled units** | Quality Dashboard | Numbers lack units or threshold context (what is "high quality"?) |
| **No loading state feedback** | Both | No skeleton/placeholder shown while data loads |

---

## 6. Initial Bottleneck Hypothesis

### Primary: N+1 Query Pattern

Both endpoints loop over study results and fire multiple queries per row inside sequential `await` calls. This means queries **cannot run in parallel** and each pays the full round-trip + sequential scan cost.

```
/api/quality/distribution  →  1 + (5 × 4) = 21 queries  →  ~455 ms
/api/studies/overview      →  1 + (5 × 3) = 16 queries  →  ~744 ms
```

### Secondary: Full Table Scans on Every Query

No indexes exist on `study_id`, `quality_score`, `participant_id`, or `site_id`. Every `WHERE study_id = '...'` clause triggers a sequential scan of all ~500 K rows.

### Tertiary: TEXT Cast Blocking Index Use

`quality_score` is declared `TEXT`. The queries use `CAST(quality_score AS DECIMAL)` inside `WHERE` and `AVG()`, which:
- Forces a row-by-row type conversion on every read
- Prevents PostgreSQL from using any future index on `quality_score` (function on the indexed column disables index scans)

### Summary Table

| Bottleneck | Impact | Fix |
|---|---|---|
| N+1 query loops | ~16–21 DB round-trips per request | Collapse to single `GROUP BY` query |
| No index on `study_id` | Seq scan of 500 K rows per query | `CREATE INDEX ON clinical_data_raw (study_id)` |
| `quality_score` stored as `TEXT` | CAST on every row, no index possible | Add composite index or change column type to `NUMERIC` |
| No index on `participant_id`, `site_id` | `COUNT(DISTINCT ...)` forces full scans | Composite indexes on `(study_id, participant_id)` etc. |

---

## 7. Before / After Comparison

> _Fill in the "After" column after applying optimizations from `database/migrations/`._

### API Response Times

| Endpoint | Before (TTFB) | After (TTFB) | Improvement |
|---|---|---|---|
| `GET /health` | 2 ms | — | — |
| `GET /api/studies/overview` | 744 ms | ___ ms | ___× faster |
| `GET /api/quality/distribution` | 455 ms | ___ ms | ___× faster |

### Server-Side DB Execution Time

| Endpoint | Before | After | Improvement |
|---|---|---|---|
| `GET /api/studies/overview` | 728 ms | ___ ms | ___× faster |
| `GET /api/quality/distribution` | 464 ms | ___ ms | ___× faster |

### Query Count per Request

| Endpoint | Before | After |
|---|---|---|
| `GET /api/studies/overview` | 16 queries | ___ queries |
| `GET /api/quality/distribution` | 21 queries | ___ queries |

### Changes Applied

> _To be completed after Task 1 implementation._

- [ ] `database/migrations/001_add_indexes.sql` — indexes on `study_id`, composite on `(study_id, quality_score)`
- [ ] Queries collapsed — N+1 loops replaced with single `GROUP BY study_id` aggregation per endpoint
- [ ] `quality_score` column type changed from `TEXT` to `NUMERIC` (optional but recommended)
- [ ] Frontend — quality scores formatted to 1–2 decimal places with % labels

---

## 17. AI Prompt Log — Traceability & Validation

### Prompt 1 — Baseline Performance Report Generation

#### Objective

Establish a reproducible baseline measurement framework before applying any optimizations.

#### Prompt Used

```text
I have a full-stack clinical quality dashboard assessment with React, Node/Express, and Postgres running in Docker Compose.

Please help me create a baseline performance report before optimization.

Tasks:
1. Inspect the project structure and identify the Quality Dashboard API endpoint.
2. Give me curl commands to measure response time and payload size.
3. Give me SQL EXPLAIN ANALYZE commands for the slow dashboard queries.
4. Create a markdown file named docs/performance-baseline.md.
5. Include sections for:
   - Environment
   - Baseline test steps
   - API response times
   - Database query performance
   - Frontend observations
   - Initial bottleneck hypothesis
   - Before/after comparison table placeholder

Do not modify application logic yet. Only create the baseline documentation and measurement commands.
```

