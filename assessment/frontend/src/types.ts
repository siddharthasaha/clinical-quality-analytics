export interface QualityDistribution {
  study_id: string;
  study_name: string;
  total_measurements: number;
  avg_quality_score: number;
  high_quality_count: number;
  low_quality_count: number;
}

export interface QualityDistributionResponse {
  data: QualityDistribution[];
  executionTime: string;
  executionTimeSeconds: string;
}

export interface StudyOverview {
  study_id: string;
  study_name: string;
  study_phase: string;
  participant_count: number;
  total_measurements: number;
  site_count: number;
}

export interface StudyOverviewResponse {
  data: StudyOverview[];
  executionTime: string;
  executionTimeSeconds: string;
}

export interface GenderBreakdown {
  gender: string;
  count: number;
}

export interface SiteDistribution {
  site_id: string;
  site_name: string;
  site_location: string;
  participant_count: number;
}

export interface ParticipantSummary {
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

export interface ParticipantSummaryResponse {
  data: ParticipantSummary[];
  executionTime: string;
  executionTimeSeconds: string;
}
