import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, it, expect } from 'vitest';
import StudyOverview from '../../components/StudyOverview';
import { server } from '../server';

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('StudyOverview — loading', () => {
  it('shows loading spinner before data resolves', () => {
    server.use(
      http.get('/api/studies/overview', () => new Promise(() => {}))
    );
    render(<StudyOverview />);
    // The spinner is a visual element; verify heading is present and data is not
    expect(screen.getByText('Study Overview')).toBeInTheDocument();
    expect(screen.queryByText('Cardiovascular Health Study')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe('StudyOverview — error', () => {
  it('shows error message on non-ok HTTP response', async () => {
    server.use(
      http.get('/api/studies/overview', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 })
      )
    );
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText(/HTTP error! status: 500/i)).toBeInTheDocument();
    });
  });

  it('shows error message on network failure', async () => {
    server.use(
      http.get('/api/studies/overview', () => HttpResponse.error())
    );
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('StudyOverview — empty data', () => {
  it('shows empty message when data array is empty', async () => {
    server.use(
      http.get('/api/studies/overview', () =>
        HttpResponse.json({ data: [], executionTime: '5ms', executionTimeSeconds: '0.005' })
      )
    );
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText(/no study data available/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Loaded state
// ---------------------------------------------------------------------------
describe('StudyOverview — loaded', () => {
  it('renders the main heading', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('Study Overview')).toBeInTheDocument();
      expect(screen.getByText(/summary of all active clinical studies/i)).toBeInTheDocument();
    });
  });

  it('renders a card for each study', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('Cardiovascular Health Study')).toBeInTheDocument();
      expect(screen.getByText('Neurology Study')).toBeInTheDocument();
    });
  });

  it('renders study_id as subheading in each card', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('CARDIO001')).toBeInTheDocument();
      expect(screen.getByText('NEURO002')).toBeInTheDocument();
    });
  });

  it('renders study phase for each study', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('Phase III')).toBeInTheDocument();
      expect(screen.getByText('Phase II')).toBeInTheDocument();
    });
  });

  it('renders participant count for each study', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
    });
  });

  it('renders total measurements for each study', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('5000')).toBeInTheDocument();
      expect(screen.getByText('3000')).toBeInTheDocument();
    });
  });

  it('renders site count for each study', async () => {
    render(<StudyOverview />);
    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
