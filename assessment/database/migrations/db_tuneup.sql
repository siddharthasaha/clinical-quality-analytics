ALTER TABLE clinical_data_raw
ALTER COLUMN quality_score TYPE NUMERIC
USING quality_score::NUMERIC;

CREATE INDEX IF NOT EXISTS idx_clinical_study_id
ON clinical_data_raw (study_id);

CREATE INDEX IF NOT EXISTS idx_clinical_study_quality
ON clinical_data_raw (study_id, quality_score);

CREATE INDEX IF NOT EXISTS idx_clinical_study_participant
ON clinical_data_raw (study_id, participant_id);

CREATE INDEX IF NOT EXISTS idx_clinical_study_site
ON clinical_data_raw (study_id, site_id);
