# Performance Baseline — Clinical Quality Dashboard

> This document was generated with AI-assisted tooling for reproducibility and traceability.
> See **Section 8 — AI Prompt Log** for the exact prompts used.

---

## 1. Environment

This report is fully reproducible using the commands provided below and was generated against a local Docker Compose environment with seeded data.

| Property          | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| **Date captured** | 2026-04-25                                                   |
| **OS**            | macOS                                                        |
| **Runtime**       | Docker Compose (local)                                       |
| **DB state**      | Warm — measured after initial seed completed                 |
| **API**           | Node.js / Express / TypeScript — `http://localhost:3000`     |
| **Frontend**      | React / Vite / TypeScript — `http://localhost:5173`          |
| **Database**      | PostgreSQL (in container) — `localhost:5432 / clinical_data` |
| **Dataset size**  | ~500 K rows, single table `clinical_data_raw`                |

### Table Schema (`clinical_data_raw`)

```sql
CREATE TABLE clinical_data_raw (
    id SERIAL PRIMARY KEY,
    study_id TEXT,
    study_name TEXT,
    study_start_date TEXT,
    study_phase TEXT,
    participant_id TEXT,
    participant_name TEXT,
    participant_dob TEXT,
    participant_gender TEXT,
    participant_enrollment_date TEXT,
    site_id TEXT,
    site_name TEXT,
    site_location TEXT,
    site_coordinator TEXT,
    measurement_type TEXT,
    measurement_value TEXT,
    measurement_unit TEXT,
    measurement_timestamp TEXT,
    quality_score TEXT,   -- ⚠ baseline: TEXT (later converted to NUMERIC during optimization)
    quality_flags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> **Note:** During optimization, `quality_score` was converted from `TEXT → NUMERIC`.
> This section reflects the **pre-optimization baseline schema**.

---

## 2. Baseline Test Steps

### Step 1 — Confirm services are running

```bash
curl http://localhost:3000/health
```

**Actual Result:**

```json
{"status":"healthy","timestamp":"2026-04-25T15:42:11.543Z"}
```

---

### Step 2 — Single-shot timing

```bash
curl -s -o /dev/null -w \
"ttfb: %{time_starttransfer}s | total: %{time_total}s | size: %{size_download}B\n" \
<URL>
```

---

### Step 3 — Run multiple samples

```bash
# Quality Distribution
for i in {1..5}; do
  curl -s -o /dev/null -w \
  "run$i: ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download}B\n" \
  http://localhost:3000/api/quality/distribution
done

# Study Overview
for i in {1..5}; do
  curl -s -o /dev/null -w \
  "run$i: ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download}B\n" \
  http://localhost:3000/api/studies/overview
done
```

---

### Step 4 — Inspect payload

```bash
curl -s -o /tmp/quality.json http://localhost:3000/api/quality/distribution
wc -c < /tmp/quality.json
jq '{executionTime}' /tmp/quality.json
```

---

## 3. API Response Times

Measured: 2026-04-25 (warm runs)

| Endpoint                    | TTFB        | Total   | Payload | DB Time |
| --------------------------- | ----------- | ------- | ------- | ------- |
| `/health`                   | 2 ms        | 2 ms    | 59 B    | N/A     |
| `/api/studies/overview`     | **~744 ms** | ~744 ms | 867 B   | 728 ms  |
| `/api/quality/distribution` | **~455 ms** | ~455 ms | 962 B   | 464 ms  |

> **Key Insight:**
> TTFB ≈ Total time → latency is dominated by **server/database processing**, not network.

---

## 4. Database Query Performance

All queries show:

```text
Seq Scan or Parallel Seq Scan
```

Meaning:

* Full table scan (~500K rows)
* No index usage

---

## 4.1 Baseline Query Execution Results

### Key Observations

| Query Type                     | Execution Time |
| ------------------------------ | -------------- |
| COUNT(*)                       | ~26 ms         |
| AVG (with CAST)                | ~64 ms         |
| High-quality filter            | ~31 ms         |
| COUNT(DISTINCT participant_id) | **~154 ms**    |

> **Critical Insight:**
> `COUNT(DISTINCT ...)` is the most expensive operation due to hash aggregation and lack of parallelism.

---

## 5. Frontend Observations

| Issue                 | Impact                                |
| --------------------- | ------------------------------------- |
| Slow initial load     | Feels like app freeze (>400 ms delay) |
| Raw decimal scores    | Hard to read                          |
| No percentage context | Poor interpretability                 |
| No loading state      | Poor UX                               |

---

## 6. Initial Bottleneck Hypothesis

### N+1 Query Pattern

```text
/api/quality/distribution → 21 queries per request
/api/studies/overview     → 16 queries per request
```

### Additional Bottlenecks

| Bottleneck        | Impact               |
| ----------------- | -------------------- |
| No indexes        | Full table scans     |
| TEXT casting      | Blocks index usage   |
| Sequential awaits | No parallel DB calls |

---

### Key Takeaways

* All queries rely on full table scans
* N+1 pattern causes excessive DB round trips
* `COUNT(DISTINCT ...)` dominates execution time
* `quality_score` TEXT forces runtime casting

 **Conclusion:** Bottleneck is entirely database-driven.

---

## 7. Before / After Comparison

| Metric           | Before | After |
| ---------------- | ------ | ----- |
| Overview API     | 744 ms | ___   |
| Distribution API | 455 ms | ___   |
| Query Count      | 16–21  | 1     |

---

### Changes Applied

* [ ] Indexes added via `database/migrations/`
* [ ] Queries collapsed to GROUP BY
* [ ] quality_score converted to NUMERIC
* [ ] Frontend formatting improved

---

## 8. AI Prompt Log — Traceability & Validation

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

---

### Prompt 2 — Database Baseline Query Execution

#### Objective

Capture actual database-level performance characteristics using `EXPLAIN ANALYZE` and document real execution plans to validate baseline bottlenecks identified at the API level.

#### Prompt Used

```text
I have a full-stack clinical quality dashboard assessment using React, Node/Express, and PostgreSQL in Docker Compose.

Please execute the database performance baseline analysis and update my existing performance markdown file.

Goal:
Add a new section named:

## 4.1 Baseline Query Execution Results

Tasks:
1. Connect to the local PostgreSQL database:
   - Host: localhost
   - Port: 5432
   - Database: clinical_data
   - User: postgres
   - Password: postgres

2. Confirm available studies:
   Run:
   SELECT study_id, study_name FROM clinical_data_raw GROUP BY study_id, study_name ORDER BY study_id;

3. Pick one representative study_id from the result.

4. Run EXPLAIN ANALYZE for these baseline queries:

EXPLAIN ANALYZE
SELECT COUNT(*) AS total_measurements
FROM clinical_data_raw
WHERE study_id = '<study_id>';

EXPLAIN ANALYZE
SELECT AVG(CAST(quality_score AS DECIMAL)) AS avg_quality_score
FROM clinical_data_raw
WHERE study_id = '<study_id>';

EXPLAIN ANALYZE
SELECT COUNT(*) AS high_quality_count
FROM clinical_data_raw
WHERE study_id = '<study_id>'
  AND CAST(quality_score AS DECIMAL) >= 0.9;

EXPLAIN ANALYZE
SELECT COUNT(DISTINCT participant_id) AS participant_count
FROM clinical_data_raw
WHERE study_id = '<study_id>';

5. Capture the actual EXPLAIN ANALYZE output.

6. Update my existing markdown file by inserting this new section immediately after:

## 4. Database Query Performance

7. Do not fabricate numbers.
8. Use only actual results from the local database.
9. If the database is not running or connection fails, stop and report the exact error.
10. Do not modify application logic.
11. Only update the markdown documentation file.
```

---

## Final Summary

This baseline demonstrates that:

* Database access patterns dominate performance
* Query design (not infrastructure) is the bottleneck
* Optimization should focus on:

  * query aggregation
  * indexing
  * schema fixes

---

