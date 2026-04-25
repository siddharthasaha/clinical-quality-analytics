# Post-Optimization Performance Metrics

**Captured:** 2026-04-25  
**Environment:** Docker Compose (local) | PostgreSQL 15 | 3,000,000 rows in `clinical_data_raw`  
**Cache state:** Warm (shared buffers populated from prior runs)

---

## `/api/studies/overview`

### curl Timing — 5 Samples

```
run1: ttfb=0.459623s  total=0.459836s   ← cold (first hit)
run2: ttfb=0.367642s  total=0.369149s
run3: ttfb=0.380438s  total=0.380573s
run4: ttfb=0.391918s  total=0.392143s
run5: ttfb=0.365636s  total=0.365818s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 459 ms |
| Warm median (runs 2–5) | **376 ms** |
| Warm min | 366 ms |
| Warm max | 392 ms |

### Server-Side DB Execution Time

```
studies/overview DB time: 384ms
```

---

## `/api/quality/distribution`

### curl Timing — 5 Samples

```
run1: ttfb=0.043825s  total=0.043949s   ← cold (first hit)
run2: ttfb=0.042585s  total=0.042669s
run3: ttfb=0.058877s  total=0.058975s
run4: ttfb=0.041976s  total=0.042071s
run5: ttfb=0.041888s  total=0.041971s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 44 ms |
| Warm median (runs 2–5) | **42 ms** |
| Warm min | 42 ms |
| Warm max | 59 ms |

### Server-Side DB Execution Time

```
quality/distribution DB time: 40ms
```

---

## Before vs. After

| Endpoint | Before TTFB | After TTFB (warm) | Improvement | Before DB time | After DB time | DB Improvement |
|---|---|---|---|---|---|---|
| `/api/studies/overview` | ~744 ms | ~376 ms | **2.0× faster** | 728 ms | 384 ms | **1.9× faster** |
| `/api/quality/distribution` | ~455 ms | ~42 ms | **10.8× faster** | 464 ms | 40 ms | **11.6× faster** |

---

## Commands Used

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

## Post-DB Optimization Metrics

**Migration applied:** `database/migrations/db_tuneup.sql`  
**Changes:** `quality_score` converted to `NUMERIC`; indexes added on `(study_id)`, `(study_id, quality_score)`, `(study_id, participant_id)`, `(study_id, site_id)`

### `/api/studies/overview` — 5 Samples

```
run1: ttfb=0.465097s  total=0.467227s   ← cold
run2: ttfb=0.376743s  total=0.376881s
run3: ttfb=0.382953s  total=0.383112s
run4: ttfb=0.367451s  total=0.367808s
run5: ttfb=0.362681s  total=0.362870s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 465 ms |
| Warm median (runs 2–5) | **372 ms** |
| Server-side DB time | **380 ms** |

### `/api/quality/distribution` — 5 Samples

```
run1: ttfb=0.041538s  total=0.041613s   ← cold
run2: ttfb=0.040899s  total=0.040973s
run3: ttfb=0.040113s  total=0.040163s
run4: ttfb=0.040750s  total=0.040812s
run5: ttfb=0.040409s  total=0.040473s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 42 ms |
| Warm median (runs 2–5) | **41 ms** |
| Server-side DB time | **42 ms** |

### Three-Stage Comparison

| Endpoint | Baseline (before) | Post-query rewrite | Post-DB migration | Total improvement |
|---|---|---|---|---|
| `/api/studies/overview` | ~744 ms | ~376 ms | ~372 ms | **2.0× faster** |
| `/api/quality/distribution` | ~455 ms | ~42 ms | ~41 ms | **11.1× faster** |

> The DB migration (indexes + NUMERIC column) had minimal additional impact on TTFB because the query rewrites already eliminated the N+1 sequential scans — the dominant cost. The indexes will show a larger benefit if the dataset grows or if point-lookup queries (filtered by single `study_id`) are added in future.

---

## Post-Combined Query Rewrite Metrics

**Change applied:** `studies.routes.ts` rewritten to a single combined query (replacing 3 separate parallel queries)  
**Approach:** One SQL query that pre-calculates measurements, participant counts, and site counts as named building blocks, then joins them together in a single database round-trip

### `/api/studies/overview` — 5 Samples

```
run1: ttfb=0.496400s  total=0.496511s   ← cold
run2: ttfb=0.365400s  total=0.365559s
run3: ttfb=0.367495s  total=0.367728s
run4: ttfb=0.357265s  total=0.357552s
run5: ttfb=0.351300s  total=0.351351s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 496 ms |
| Warm median (runs 2–5) | **358 ms** |
| Server-side DB time | **368 ms** |
| Query count | **1** (single combined query) |

### `/api/quality/distribution` — 5 Samples (unchanged)

```
run1: ttfb=0.043683s  total=0.043735s   ← cold
run2: ttfb=0.041075s  total=0.041139s
run3: ttfb=0.041181s  total=0.041228s
run4: ttfb=0.040774s  total=0.040821s
run5: ttfb=0.043991s  total=0.044073s
```

| Metric | Value |
|---|---|
| Warm median (runs 2–5) | **41 ms** |
| Server-side DB time | **40 ms** |
| Query count | **1** (single GROUP BY) |

### Four-Stage Comparison

| Endpoint | Baseline | Post-query rewrite | Post-DB migration | Post-combined query rewrite | Total improvement |
|---|---|---|---|---|---|
| `/api/studies/overview` | ~744 ms | ~376 ms | ~372 ms | **~358 ms** | **2.1× faster** |
| `/api/quality/distribution` | ~455 ms | ~42 ms | ~41 ms | **~41 ms** | **11.1× faster** |

---

## Post-Combined Query + Indexes — Final Metrics

**Migration re-applied:** `database/migrations/db_tuneup.sql` (fresh container — indexes created cleanly)  
**API:** Combined-query rewrite of `studies.routes.ts` + single aggregation query in `quality.routes.ts`  
**Captured:** 2026-04-25

### `/api/studies/overview` — 5 Samples

```
run1: ttfb=0.097730s  total=0.097789s   ← cold
run2: ttfb=0.068099s  total=0.068178s
run3: ttfb=0.064743s  total=0.064808s
run4: ttfb=0.064417s  total=0.064553s
run5: ttfb=0.063820s  total=0.063960s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 98 ms |
| Warm median (runs 2–5) | **64 ms** |
| Server-side DB time | **66 ms** |
| Query count | **1** (single combined query) |

### `/api/quality/distribution` — 5 Samples

```
run1: ttfb=0.043529s  total=0.043638s   ← cold
run2: ttfb=0.040845s  total=0.040928s
run3: ttfb=0.042651s  total=0.042708s
run4: ttfb=0.041966s  total=0.042046s
run5: ttfb=0.046062s  total=0.046156s
```

| Metric | Value |
|---|---|
| Cold-start (run1) | 44 ms |
| Warm median (runs 2–5) | **42 ms** |
| Server-side DB time | **43 ms** |
| Query count | **1** (single GROUP BY) |

### Final Comparison — All Stages

| Endpoint | Baseline | Post-query rewrite | Post-DB migration | Post-combined query rewrite | **Final (combined query + indexes)** | **Total improvement** |
|---|---|---|---|---|---|---|
| `/api/studies/overview` | ~744 ms | ~376 ms | ~372 ms | ~358 ms | **~64 ms** | **11.6× faster** |
| `/api/quality/distribution` | ~455 ms | ~42 ms | ~41 ms | ~41 ms | **~42 ms** | **10.8× faster** |

> The indexes in `db_tuneup.sql` unlocked their full benefit once the combined query rewrite was in place — the new query structure allows PostgreSQL to use `idx_clinical_study_participant` and `idx_clinical_study_site` to look up distinct participants and sites directly, instead of scanning all 3 million rows, dropping studies/overview from ~358 ms to **~64 ms**.
