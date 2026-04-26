# Schema Design Proposal — Clinical Data Platform

---

## Design Goals

* Eliminate data duplication and improve data integrity
* Enable efficient analytical queries at scale (50M–1B rows)
* Support auditability and traceability of data changes
* Improve query performance by aligning schema with access patterns
* Allow zero-downtime migration from the existing system

---

## Current State

The database currently uses a single denormalized table `clinical_data_raw` with 21 columns, storing every measurement row with full study, participant, and site details repeated.

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
    quality_score NUMERIC,
    quality_flags TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Current Issues

| Issue                                       | Impact                        |
| ------------------------------------------- | ----------------------------- |
| Study data repeated on every row            | Storage bloat and update risk |
| Participant data duplicated per measurement | Inefficient queries           |
| Site data repeated                          | Inconsistent metadata         |
| Dates stored as TEXT                        | No efficient filtering        |
| No referential integrity                    | Data inconsistency risk       |
| Missing audit fields                        | No traceability               |

---

## Modeling Assumptions

* A participant belongs to a single study
* If multi-study participation is required, use a join table:

```sql
participants (participant_id PK)
study_participants (study_id, participant_id PK)
```

---

## Proposed Normalized Schema

### ERD Overview

```
┌──────────────────────────┐                      ┌──────────────────────────┐
│          studies         │                      │          sites           │
├──────────────────────────┤                      ├──────────────────────────┤
│ PK  study_id             │  ┌─────────────────┐ │ PK  site_id              │
│     study_name           │──┤   study_sites   ├─│     site_name            │
│     start_date           │  ├─────────────────┤ │     location             │
│     phase                │  │ PK,FK  study_id │ │     coordinator          │
│     created_at/by        │  │ PK,FK  site_id  │ │     created_at/by        │
│     modified_at/by       │  │        .../by   │ │     modified_at/by       │
└────────────┬─────────────┘  └─────────────────┘ └──────────────────────────┘
             │ 1:N
             ▼
┌──────────────────────────┐
│       participants       │
├──────────────────────────┤
│ PK  participant_id       │
│ FK  study_id             │
│ FK  site_id              │
│     full_name            │
│     date_of_birth        │
│     gender               │
│     enrollment_date      │
│     created_at/by        │
│     modified_at/by       │
└────────────┬─────────────┘
             │ 1:N
             ▼
┌──────────────────────────┐           ┌──────────────────────────┐
│       measurements       │    N:1    │    measurement_types     │
├──────────────────────────┤──────────>├──────────────────────────┤
│ PK  id (BIGSERIAL)       │           │ PK  measurement_type     │
│ FK  participant_id       │           │     unit                 │
│     study_id  (denorm)   │           │     value_min            │
│ FK  measurement_type     │           │     value_max            │
│     value_numeric        │           │     description          │
│     value_systolic       │           │     created_at/by        │
│     value_diastolic      │           │     modified_at/by       │
│     measured_at          │           └──────────────────────────┘
│     quality_score        │
│     quality_flag         │
│     created_at/by        │
│     modified_at/by       │
└──────────────────────────┘
```

**Relationship summary:**

| From              | Cardinality | To                  | Via              |
| ----------------- | ----------- | ------------------- | ---------------- |
| studies           | 1:N         | participants        | direct FK        |
| studies           | M:N         | sites               | study_sites      |
| participants      | 1:N         | measurements        | direct FK        |
| measurement_types | 1:N         | measurements        | direct FK        |
| participants      | N:1         | sites               | direct FK        |

---

## Tables

### studies

```sql
CREATE TABLE studies (
    study_id TEXT PRIMARY KEY,
    study_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    phase TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT
);
```

---

### sites

```sql
CREATE TABLE sites (
    site_id TEXT PRIMARY KEY,
    site_name TEXT NOT NULL,
    location TEXT NOT NULL,
    coordinator TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT
);
```

---

### study_sites

```sql
CREATE TABLE study_sites (
    study_id TEXT REFERENCES studies,
    site_id TEXT REFERENCES sites,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT,
    PRIMARY KEY (study_id, site_id)
);
```

---

### participants

```sql
CREATE TABLE participants (
    participant_id TEXT PRIMARY KEY,
    study_id TEXT REFERENCES studies,
    site_id TEXT REFERENCES sites,
    full_name TEXT,
    date_of_birth DATE,
    gender TEXT,
    enrollment_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT
);
```

---

### measurement_types

```sql
CREATE TABLE measurement_types (
    measurement_type TEXT PRIMARY KEY,
    unit TEXT NOT NULL,
    value_min NUMERIC,
    value_max NUMERIC,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT
);
```

---

### measurements

```sql
CREATE TABLE measurements (
    id BIGSERIAL PRIMARY KEY,
    participant_id TEXT REFERENCES participants,
    study_id TEXT, -- deliberate denormalization for performance
    measurement_type TEXT REFERENCES measurement_types,
    value_numeric NUMERIC,
    value_systolic SMALLINT,
    value_diastolic SMALLINT,
    measured_at TIMESTAMPTZ,
    quality_score NUMERIC,
    quality_flag TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT NOT NULL,
    modified_at TIMESTAMPTZ,
    modified_by TEXT
);
```

---

## Denormalization Tradeoff

Adding `study_id` to `measurements`:

* Reduces join cost for aggregations
* Improves query performance for large datasets
* Acceptable tradeoff for analytical workloads

---

## Index Strategy

```sql
CREATE INDEX idx_participants_study ON participants(study_id);
CREATE INDEX idx_measurements_study ON measurements(study_id);
CREATE INDEX idx_measurements_participant ON measurements(participant_id);
CREATE INDEX idx_measurements_time ON measurements(measured_at);
CREATE INDEX idx_measurements_quality ON measurements(quality_score);
```

---

## Query Performance Impact

| Query             | Before         | After              |
| ----------------- | -------------- | ------------------ |
| Participant count | DISTINCT scan  | COUNT(*)           |
| Site distribution | Repeated scans | Direct aggregation |
| Measurements      | Full scan      | Indexed            |

---

## Migration Strategy

### Phase 1 — Stabilize

* Keep raw table
* Add indexes
* Optimize queries

---

### Phase 2 — Backfill

* Create normalized tables
* Batch insert data (keyset pagination)
* Use idempotent inserts

---

### Phase 3 — Validate

* Compare counts between old and new
* Validate metrics

---

### Phase 4 — Cutover

* Switch APIs
* Keep raw table as backup

---

### Phase 5 — Scale

* Partition measurements by time
* Add materialized views

---

## Partitioning Strategy

Partition `measurements` by `measured_at`:

* Limits scan range
* Improves performance
* Enables archival

---

## Materialized Views

Used for dashboard queries:

* Fast reads
* Reduced compute

Tradeoff:

* Requires refresh

---

## Rollback Strategy

* Keep raw table intact
* API switch reversible
* Backfill idempotent

---

