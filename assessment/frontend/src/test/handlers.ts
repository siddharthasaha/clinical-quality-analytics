import { http, HttpResponse } from 'msw';
import type {
  QualityDistributionResponse,
  StudyOverviewResponse,
  ParticipantSummaryResponse,
} from '../types';

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------
export const mockQualityData: QualityDistributionResponse = {
  data: [
    {
      study_id: 'CARDIO001',
      study_name: 'Cardiovascular Health Study',
      total_measurements: 5000,
      avg_quality_score: 0.87,
      high_quality_count: 2500,
      low_quality_count: 800,
    },
    {
      study_id: 'NEURO002',
      study_name: 'Neurology Study',
      total_measurements: 3000,
      avg_quality_score: 0.92,
      high_quality_count: 2000,
      low_quality_count: 200,
    },
  ],
  executionTime: '45ms',
  executionTimeSeconds: '0.045',
};

export const mockStudyOverviewData: StudyOverviewResponse = {
  data: [
    {
      study_id: 'CARDIO001',
      study_name: 'Cardiovascular Health Study',
      study_phase: 'Phase III',
      participant_count: 120,
      total_measurements: 5000,
      site_count: 8,
    },
    {
      study_id: 'NEURO002',
      study_name: 'Neurology Study',
      study_phase: 'Phase II',
      participant_count: 80,
      total_measurements: 3000,
      site_count: 5,
    },
  ],
  executionTime: '38ms',
  executionTimeSeconds: '0.038',
};

export const mockParticipantData: ParticipantSummaryResponse = {
  data: [
    {
      study_id: 'CARDIO001',
      study_name: 'Cardiovascular Health Study',
      total_participants: 120,
      avg_age: 54.3,
      min_age: 32,
      max_age: 78,
      avg_measurements_per_participant: 41.7,
      data_start_date: '2024-01-15T09:00:00.000Z',
      data_end_date: '2025-12-30T16:45:00.000Z',
      gender_breakdown: [
        { gender: 'Male', count: 65 },
        { gender: 'Female', count: 55 },
      ],
      site_distribution: [
        { site_id: 'SITE_A', site_name: 'Boston General', site_location: 'Boston, MA', participant_count: 60 },
        { site_id: 'SITE_B', site_name: 'Chicago Medical', site_location: 'Chicago, IL', participant_count: 60 },
      ],
    },
    {
      study_id: 'NEURO002',
      study_name: 'Neurology Study',
      total_participants: 80,
      avg_age: 48.1,
      min_age: 25,
      max_age: 70,
      avg_measurements_per_participant: 37.5,
      data_start_date: '2024-03-01T08:00:00.000Z',
      data_end_date: '2025-11-15T14:00:00.000Z',
      gender_breakdown: [
        { gender: 'Female', count: 45 },
        { gender: 'Male', count: 35 },
      ],
      site_distribution: [
        { site_id: 'SITE_C', site_name: 'NY Neurology', site_location: 'New York, NY', participant_count: 80 },
      ],
    },
  ],
  executionTime: '120ms',
  executionTimeSeconds: '0.12',
};

// ---------------------------------------------------------------------------
// Default MSW handlers
// ---------------------------------------------------------------------------
export const handlers = [
  http.get('/api/quality/distribution', () => HttpResponse.json(mockQualityData)),
  http.get('/api/studies/overview', () => HttpResponse.json(mockStudyOverviewData)),
  http.get('/api/participants/summary', () => HttpResponse.json(mockParticipantData)),
];
