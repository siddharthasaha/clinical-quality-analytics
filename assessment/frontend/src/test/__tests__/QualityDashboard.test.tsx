import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect } from 'vitest';
import QualityDashboard from '../../components/QualityDashboard';
import { server } from '../server';
import { mockQualityData } from '../handlers';

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('QualityDashboard — loading', () => {
  it('shows loading spinner before data resolves', () => {
    server.use(
      http.get('/api/quality/distribution', () => new Promise(() => {}))
    );
    render(<QualityDashboard />);
    expect(screen.getByText(/loading quality data/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe('QualityDashboard — error', () => {
  it('shows error message on non-ok HTTP response', async () => {
    server.use(
      http.get('/api/quality/distribution', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 })
      )
    );
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/error loading data/i)).toBeInTheDocument();
    });
  });

  it('shows the HTTP status in the error message', async () => {
    server.use(
      http.get('/api/quality/distribution', () =>
        HttpResponse.json({}, { status: 503 })
      )
    );
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/503/)).toBeInTheDocument();
    });
  });

  it('renders a Retry button on error', async () => {
    server.use(
      http.get('/api/quality/distribution', () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('re-fetches data when Retry button is clicked', async () => {
    const user = userEvent.setup();
    let callCount = 0;
    server.use(
      http.get('/api/quality/distribution', () => {
        callCount++;
        if (callCount === 1) return HttpResponse.json({}, { status: 500 });
        return HttpResponse.json(mockQualityData);
      })
    );
    render(<QualityDashboard />);
    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    await user.click(retryBtn);
    await waitFor(() => {
      expect(screen.getByText('Cardiovascular Health Study')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows error on network failure', async () => {
    server.use(
      http.get('/api/quality/distribution', () => HttpResponse.error())
    );
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/error loading data/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('QualityDashboard — empty data', () => {
  it('shows empty message when data array is empty', async () => {
    server.use(
      http.get('/api/quality/distribution', () =>
        HttpResponse.json({ data: [], executionTime: '5ms', executionTimeSeconds: '0.005' })
      )
    );
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/no quality data available/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Loaded state
// ---------------------------------------------------------------------------
describe('QualityDashboard — loaded', () => {
  it('renders the main heading', async () => {
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/quality score distribution by study/i)).toBeInTheDocument();
    });
  });

  it('renders a summary table row for each study', async () => {
    render(<QualityDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Cardiovascular Health Study')).toBeInTheDocument();
      expect(screen.getByText('Neurology Study')).toBeInTheDocument();
    });
  });

  it('displays formatted avg quality score as percentage', async () => {
    render(<QualityDashboard />);
    await waitFor(() => {
      // 0.87 → "87.0%"
      expect(screen.getByText('87.0%')).toBeInTheDocument();
    });
  });

  it('displays high quality count with percentage', async () => {
    render(<QualityDashboard />);
    await waitFor(() => {
      // 2500 / 5000 = 50.0%
      expect(screen.getByText(/2,500.*50\.0%/)).toBeInTheDocument();
    });
  });

  it('displays low quality count with percentage', async () => {
    render(<QualityDashboard />);
    await waitFor(() => {
      // 800 / 5000 = 16.0%
      expect(screen.getByText(/800.*16\.0%/)).toBeInTheDocument();
    });
  });
});
