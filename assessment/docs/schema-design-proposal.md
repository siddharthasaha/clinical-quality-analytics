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
studies ──< study_sites >── sites
   │
   └──< participants
              │
              └──< measurements
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

#### `measurements`
```sql
CREATE TABLE measurements (
    id                  BIGSERIAL    PRIMARY KEY,
    participant_id      TEXT         NOT NULL REFERENCES participants(participant_id),
    measurement_type    TEXT         NOT NULL,
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

1. **Create new tables** alongside `clinical_data_raw` (no downtime).
2. **Back-fill** by selecting distinct entities from `clinical_data_raw` into `studies`, `sites`, `study_sites`, and `participants`.
3. **Migrate measurements**, parsing `measurement_value` to split blood pressure strings and cast numeric values.
4. **Update API queries** to join the new tables — the existing route structure in `participants.routes.ts` maps cleanly onto the proposed schema.
5. **Validate row counts** and spot-check aggregates against the current table.
6. **Drop `clinical_data_raw`** once the application is verified against the new schema.

---

## Open Questions

- Should `participant_name` be retained or removed for PII / HIPAA compliance?
- Should `measurement_type` be a foreign key into a `measurement_types` lookup table to enforce valid types?
- Is a soft-delete / audit trail required on any table?
