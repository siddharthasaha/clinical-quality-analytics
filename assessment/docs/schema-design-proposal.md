# Schema Design Proposal

## Current State

The database currently uses a single denormalised table `clinical_data_raw` with 21 columns, storing every measurement row with full study, participant, and site details repeated verbatim:

```sql
CREATE TABLE clinical_data_raw (
    id                          SERIAL PRIMARY KEY,
    study_id                    TEXT,
    study_name                  TEXT,
    study_start_date            TEXT,
    study_phase                 TEXT,
    participant_id              TEXT,
    participant_name            TEXT,
    participant_dob             TEXT,
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
    quality_score               NUMERIC,
    quality_flags               TEXT,
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Current Issues**

| Issue | Impact |
|---|---|
| Study data repeated on every row | Storage bloat and update risk |
| Participant data repeated for every measurement | Inefficient queries and duplicate demographics |
| Site data repeated across participants | Inconsistent site metadata risk |
| Measurements stored with mixed metadata | Harder to scale to 50–100M rows |
| Several date fields stored as `TEXT` | Prevents efficient date filtering |
| Single large table | Slower analytics as data grows |
| `modified_at`, `created_by`, and `modified_by` fields are missing | No audit trail — cannot determine who created or last modified a record, or when it was last changed |

---

## Proposed Normalised Schema

### Entity-relationship overview

```
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│     studies     │        │   study_sites   │        │      sites      │
│─────────────────│        │─────────────────│        │─────────────────│
│ study_id   (PK) │──────< │ study_id   (FK) │ >──────│ site_id    (PK) │
│ study_name      │        │ site_id    (FK) │        │ site_name       │
│ start_date      │        │ created_at      │        │ location        │
│ phase           │        │ created_by      │        │ coordinator     │
│ created_at      │        │ modified_at     │        │ created_at      │
│ created_by      │        │ modified_by     │        │ created_by      │
│ modified_at     │        └─────────────────┘        │ modified_at     │
│ modified_by     │                                   │ modified_by     │
└────────┬────────┘                                   └────────┬────────┘
         │                                                     │
         │ 1                                                   │ 1
         │ *                                                   │ *
┌────────┴────────────────────────────────────────────────────┴────────┐
│                           participants                                │
│───────────────────────────────────────────────────────────────────────│
│ participant_id  (PK)                                                  │
│ study_id        (FK) ──────────────────────────────────────────────── │
│ site_id         (FK) ──────────────────────────────────────────────── │
│ full_name                                                             │
│ date_of_birth                                                         │
│ gender                                                                │
│ enrollment_date                                                       │
│ created_at  │ created_by  │ modified_at  │ modified_by               │
└──────┬──────────────────────────────────────────────────────────────-─┘
       │ 1
       │ *
┌──────┴──────────────┐        ┌──────────────────────┐
│    measurements     │        │   measurement_types  │
│─────────────────────│        │──────────────────────│
│ id             (PK) │        │ measurement_type (PK)│
│ participant_id (FK) │        │ unit                 │
│ measurement_type(FK)│>───────│ value_min            │
│ value_numeric       │        │ value_max            │
│ value_systolic      │        │ description          │
│ value_diastolic     │        │ created_at           │
│ unit                │        │ created_by           │
│ measured_at         │        │ modified_at          │
│ quality_score       │        │ modified_by          │
│ quality_flag        │        └──────────────────────┘
│ created_at          │
│ created_by          │
│ modified_at         │
│ modified_by         │
└─────────────────────┘
```

---

### Table definitions


#### `studies`
```sql
CREATE TABLE studies (
    study_id    TEXT        PRIMARY KEY,
    study_name  TEXT        NOT NULL,
    start_date  DATE        NOT NULL,
    phase       TEXT        NOT NULL CHECK (phase IN ('Phase 1','Phase 2','Phase 3','Phase 4')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT        NOT NULL,
    modified_at TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by TEXT
);
```

#### `sites`
```sql
CREATE TABLE sites (
    site_id     TEXT PRIMARY KEY,
    site_name   TEXT NOT NULL,
    location    TEXT NOT NULL,
    coordinator TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT        NOT NULL,
    modified_at TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by TEXT
);
```

#### `study_sites`  *(which sites participate in which studies)*
```sql
CREATE TABLE study_sites (
    study_id    TEXT        NOT NULL REFERENCES studies(study_id),
    site_id     TEXT        NOT NULL REFERENCES sites(site_id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  TEXT        NOT NULL,
    modified_at TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by TEXT,
    PRIMARY KEY (study_id, site_id)
);
```

#### `participants`
```sql
CREATE TABLE participants (
    participant_id    TEXT        PRIMARY KEY,
    study_id          TEXT        NOT NULL REFERENCES studies(study_id),
    site_id           TEXT        NOT NULL REFERENCES sites(site_id),
    full_name         TEXT        NOT NULL,
    date_of_birth     DATE        NOT NULL,
    gender            TEXT        NOT NULL,
    enrollment_date   DATE        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        TEXT        NOT NULL,
    modified_at       TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by       TEXT
);
```
#### `measurement_types`
```sql
CREATE TABLE measurement_types (
    measurement_type  TEXT        PRIMARY KEY,
    unit              TEXT        NOT NULL,
    value_min         NUMERIC,
    value_max         NUMERIC,
    description       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        TEXT        NOT NULL,
    modified_at       TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by       TEXT
);

-- Seed with known types
INSERT INTO measurement_types (measurement_type, unit, value_min, value_max, created_by) VALUES
    ('glucose',        'mg/dL',  70,  200, 'system'),
    ('blood_pressure', 'mmHg',   90,  180, 'system'),
    ('weight',         'kg',     45,  120, 'system'),
    ('heart_rate',     'bpm',    50,  120, 'system'),
    ('cholesterol',    'mg/dL', 120,  280, 'system'),
    ('bmi',            'kg/m²',  16,   45, 'system');
```


#### `measurements`
```sql
CREATE TABLE measurements (
    id                  BIGSERIAL    PRIMARY KEY,
    participant_id      TEXT         NOT NULL REFERENCES participants(participant_id),
    measurement_type    TEXT         NOT NULL REFERENCES measurement_types(measurement_type),
    value_numeric       NUMERIC,                  -- populated for single-value types
    value_systolic      SMALLINT,                 -- populated for blood_pressure
    value_diastolic     SMALLINT,                 -- populated for blood_pressure
    unit                TEXT         NOT NULL,
    measured_at         TIMESTAMPTZ  NOT NULL,
    quality_score       NUMERIC(4,2) CHECK (quality_score BETWEEN 0 AND 1),
    quality_flag        TEXT         CHECK (quality_flag IN (
                            'incomplete_data','equipment_error','patient_movement'
                        )),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          TEXT         NOT NULL,
    modified_at         TIMESTAMPTZ,          -- set automatically by trigger on UPDATE
    modified_by         TEXT
);
```

---

### Indexes

```sql
-- Participant lookups by study (replaces idx_clinical_study_participant)
CREATE INDEX idx_participants_study  ON participants (study_id);
CREATE INDEX idx_participants_site   ON participants (site_id);

-- Measurement queries by participant and time range
CREATE INDEX idx_measurements_participant    ON measurements (participant_id);
CREATE INDEX idx_measurements_type_at       ON measurements (measurement_type, measured_at);
CREATE INDEX idx_measurements_quality       ON measurements (quality_score);

-- Study-level quality aggregations (replaces idx_clinical_study_quality)
CREATE INDEX idx_measurements_participant_quality
    ON measurements (participant_id, quality_score);
```

### Triggers

A single reusable trigger function sets `modified_at` to the current timestamp on every `UPDATE`.
Apply it to each table that carries the `modified_at` column.

```sql
-- Shared trigger function
CREATE OR REPLACE FUNCTION set_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to each table
CREATE TRIGGER trg_studies_modified_at
    BEFORE UPDATE ON studies
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

CREATE TRIGGER trg_sites_modified_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

CREATE TRIGGER trg_study_sites_modified_at
    BEFORE UPDATE ON study_sites
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

CREATE TRIGGER trg_participants_modified_at
    BEFORE UPDATE ON participants
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

CREATE TRIGGER trg_measurements_modified_at
    BEFORE UPDATE ON measurements
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();
```

---

## Key Improvements

| Area | Current | Proposed |
|---|---|---|
| Storage | Study/site columns duplicated ~500 K times | Stored once per entity |
| Date types | `TEXT` | `DATE` / `TIMESTAMPTZ` — enables range queries natively |
| Blood pressure | Stored as `"120/80"` string | Split into `value_systolic` / `value_diastolic` (`SMALLINT`) |
| Referential integrity | None | Foreign keys on all relationships |
| Participant aggregation | Requires `DISTINCT` CTE to deduplicate | Participants are a first-class table; simple `COUNT(*)` |
| Quality flag validation | Any string accepted | `CHECK` constraint restricts to known flag values |

---

## Migration Strategy

Migration runs in phases alongside `clinical_data_raw` so there is no downtime and each step is independently reversible.

> **Scale note:** At 1 billion rows, single `INSERT … SELECT` statements will time out, exhaust WAL/undo space, and lock the source table for hours. All large back-fills use **keyset-paginated batch loops** that commit every N rows, can be paused and resumed, and leave the source table fully readable throughout.

---

### Phase 1 — Stabilize current app

Goal: improve performance of the existing schema without breaking anything.

1. **Keep `clinical_data_raw` as-is** — no structural changes that could break existing queries.
2. **Add indexes** (already delivered in `db_tuneup.sql`):
   ```sql
   CREATE INDEX IF NOT EXISTS idx_clinical_study_id           ON clinical_data_raw (study_id);
   CREATE INDEX IF NOT EXISTS idx_clinical_study_quality      ON clinical_data_raw (study_id, quality_score);
   CREATE INDEX IF NOT EXISTS idx_clinical_study_participant  ON clinical_data_raw (study_id, participant_id);
   CREATE INDEX IF NOT EXISTS idx_clinical_study_site         ON clinical_data_raw (study_id, site_id);
   ```
3. **Convert key fields where safe** — cast timestamp and date columns to proper types using generated/computed columns or views so existing TEXT comparisons keep working:
   ```sql
   ALTER TABLE clinical_data_raw
       ALTER COLUMN quality_score TYPE NUMERIC USING quality_score::NUMERIC;
   ```
4. **Optimize queries** — rewrite dashboard API queries to use the new indexes; replace full-table `DISTINCT` scans with indexed lookups.

---

### Phase 2 — Introduce normalised schema

Goal: create the new normalised tables and back-fill data from `clinical_data_raw`.

5. Create all new tables: `measurement_types`, `studies`, `sites`, `study_sites`, `participants`, `measurements`, `audit_log`, `migration_state`.
6. Create indexes and `set_modified_at` trigger function. **Defer audit triggers on `measurements`** until after back-fill — firing per-row triggers at billion-row scale doubles write cost.
7. Seed `measurement_types` with the six known types.
8. Back-fill reference tables (low row counts — single statements are fine):
   ```sql
   INSERT INTO studies (study_id, study_name, start_date, phase, created_by)
   SELECT DISTINCT study_id, study_name, study_start_date::DATE, study_phase, 'migration'
   FROM clinical_data_raw;

   INSERT INTO sites (site_id, site_name, location, coordinator, created_by)
   SELECT DISTINCT site_id, site_name, site_location, site_coordinator, 'migration'
   FROM clinical_data_raw;

   INSERT INTO study_sites (study_id, site_id, created_by)
   SELECT DISTINCT study_id, site_id, 'migration'
   FROM clinical_data_raw;

   INSERT INTO participants
       (participant_id, study_id, site_id, full_name, date_of_birth, gender, enrollment_date, created_by)
   SELECT DISTINCT ON (participant_id)
       participant_id, study_id, site_id,
       participant_name, participant_dob::DATE,
       participant_gender, participant_enrollment_date::DATE, 'migration'
   FROM clinical_data_raw;
   ```
9. Back-fill `measurements` using a **keyset-paginated batch loop** (100,000 rows per commit):
   

   **If the batch loop fails:** the loop commits `last_id` atomically with each batch. Re-running the loop resumes from the last successfully committed offset. `ON CONFLICT DO NOTHING` makes every batch fully idempotent.

   | Concern | Mitigation |
   |---|---|
   | Index build cost | Drop non-PK indexes before back-fill; rebuild with `CREATE INDEX CONCURRENTLY` after |
   | Autovacuum pressure | Run `VACUUM ANALYZE measurements` after back-fill |
   | Parallel throughput | Multiple workers on non-overlapping `id` ranges (0–250M, 250M–500M, …) |
   | Replication lag | Monitor lag; throttle batch size if threshold exceeded |
   | Disk space | Ensure ≥ 1.5× source table size is free before starting |

10. Re-attach audit trigger on `measurements` after back-fill completes:
    ```sql
    CREATE TRIGGER trg_audit_measurements
        AFTER INSERT OR UPDATE OR DELETE ON measurements
        FOR EACH ROW EXECUTE FUNCTION record_audit();
    ```

---

### Phase 3 — Dual-read validation

Goal: confirm the normalised schema produces identical results to `clinical_data_raw` before any API is switched over.

11. **Participant counts** — compare per study:
    ```sql
    -- Old
    SELECT study_id, COUNT(DISTINCT participant_id) FROM clinical_data_raw GROUP BY study_id;
    -- New
    SELECT study_id, COUNT(*) FROM participants GROUP BY study_id;
    ```
12. **Site counts** — compare per study:
    ```sql
    -- Old
    SELECT study_id, COUNT(DISTINCT site_id) FROM clinical_data_raw GROUP BY study_id;
    -- New
    SELECT study_id, COUNT(*) FROM study_sites GROUP BY study_id;
    ```
13. **Measurement counts** — total and per type:
    ```sql
    -- Old
    SELECT measurement_type, COUNT(*) FROM clinical_data_raw GROUP BY measurement_type;
    -- New
    SELECT measurement_type, COUNT(*) FROM measurements GROUP BY measurement_type;
    ```
14. **Quality metrics** — avg quality score per study:
    ```sql
    -- Old
    SELECT study_id, ROUND(AVG(quality_score), 4) FROM clinical_data_raw GROUP BY study_id;
    -- New
    SELECT p.study_id, ROUND(AVG(m.quality_score), 4)
    FROM measurements m JOIN participants p USING (participant_id)
    GROUP BY p.study_id;
    ```
15. All four checks must produce zero discrepancies before proceeding.

---

### Phase 4 — Cut over APIs

Goal: point dashboard APIs at the normalised schema while keeping `clinical_data_raw` available for audit and rollback.

16. Update API queries in `participants.routes.ts` (and all other routes) to join the new tables.
17. Deploy and smoke-test in a staging environment against the normalised schema.
18. Switch production traffic to the new queries.
19. **Keep `clinical_data_raw` read-only** — do not drop it yet; it serves as an audit reference and instant rollback point.

---

### Phase 5 — Long-term scale

Goal: prepare `measurements` for 50–100M+ rows and fast analytics.

20. **Partition `measurements`** by `measured_at` (range partitioning by month or quarter) so queries that filter by date scan only relevant partitions:
    ```sql
    -- Example: convert to partitioned table
    CREATE TABLE measurements_partitioned (
        LIKE measurements INCLUDING ALL
    ) PARTITION BY RANGE (measured_at);

    CREATE TABLE measurements_2022 PARTITION OF measurements_partitioned
        FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');
    CREATE TABLE measurements_2023 PARTITION OF measurements_partitioned
        FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
    -- Add future partitions as needed
    ```
21. **Add materialized views** for expensive dashboard aggregates so the UI reads pre-computed results instead of running full scans on every request:
    ```sql
    CREATE MATERIALIZED VIEW mv_participant_summary AS
    SELECT
        p.study_id,
        COUNT(DISTINCT p.participant_id)                        AS total_participants,
        ROUND(AVG(EXTRACT(YEAR FROM age(p.date_of_birth))), 1) AS avg_age,
        MIN(EXTRACT(YEAR FROM age(p.date_of_birth)))::INT       AS min_age,
        MAX(EXTRACT(YEAR FROM age(p.date_of_birth)))::INT       AS max_age,
        ROUND(COUNT(m.id)::NUMERIC / NULLIF(COUNT(DISTINCT p.participant_id), 0), 1)
                                                                AS avg_measurements_per_participant
    FROM participants p
    LEFT JOIN measurements m USING (participant_id)
    GROUP BY p.study_id
    WITH DATA;

    CREATE UNIQUE INDEX ON mv_participant_summary (study_id);

    -- Refresh on a schedule (e.g. nightly via pg_cron or a cron job)
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_participant_summary;
    ```

---

### Phase 6 — Clean up

22. Rename `clinical_data_raw` to `clinical_data_raw_archive` for a safe holding period.
23. Drop `clinical_data_raw_archive` and `migration_state` after a confirmed observation window (recommended: 30 days).

---

## Open Questions

- Should `participant_name` be retained or removed for PII / HIPAA compliance?
