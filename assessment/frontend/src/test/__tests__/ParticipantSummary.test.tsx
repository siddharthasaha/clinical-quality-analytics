import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, vi } from 'vitest';
import ParticipantSummary from '../../components/ParticipantSummary';
import { server } from '../server';
import { mockParticipantData } from '../handlers';

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe('ParticipantSummary — loading', () => {
  it('shows loading spinner before data resolves', () => {
    // Never resolves so we catch the loading state
    server.use(
      http.get('/api/participants/summary', () => new Promise(() => {}))
    );
    render(<ParticipantSummary />);
    expect(screen.getByText(/loading participant data/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe('ParticipantSummary — error', () => {
  it('shows error message on non-ok HTTP response', async () => {
    server.use(
      http.get('/api/participants/summary', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 })
      )
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/error loading data/i)).toBeInTheDocument();
    });
  });

  it('shows the HTTP status in the error message', async () => {
    server.use(
      http.get('/api/participants/summary', () =>
        HttpResponse.json({}, { status: 503 })
      )
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/503/)).toBeInTheDocument();
    });
  });

  it('shows error message on network failure', async () => {
    server.use(
      http.get('/api/participants/summary', () => HttpResponse.error())
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/error loading data/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe('ParticipantSummary — empty data', () => {
  it('shows empty message when data array is empty', async () => {
    server.use(
      http.get('/api/participants/summary', () =>
        HttpResponse.json({ data: [], executionTime: '5ms', executionTimeSeconds: '0.005' })
      )
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/no participant data available/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Loaded state — study selector
// ---------------------------------------------------------------------------
describe('ParticipantSummary — study selector', () => {
  it('renders all study names in the dropdown', async () => {
    render(<ParticipantSummary />);
    const select = await screen.findByRole('combobox');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(mockParticipantData.data.length);
    expect(options[0].textContent).toContain('Cardiovascular Health Study');
    expect(options[1].textContent).toContain('Neurology Study');
  });

  it('auto-selects the first study when no initialStudyId is given', async () => {
    render(<ParticipantSummary />);
    const select = await screen.findByRole<HTMLSelectElement>('combobox');
    expect(select.value).toBe('CARDIO001');
  });

  it('pre-selects the study matching initialStudyId', async () => {
    render(<ParticipantSummary initialStudyId="NEURO002" />);
    const select = await screen.findByRole<HTMLSelectElement>('combobox');
    expect(select.value).toBe('NEURO002');
  });

  it('updates displayed stats when a different study is selected', async () => {
    const user = userEvent.setup();
    render(<ParticipantSummary />);
    const select = await screen.findByRole('combobox');

    // CARDIO001 is default — check its participant count is visible
    expect(await screen.findByText('120')).toBeInTheDocument();

    // Switch to NEURO002
    await user.selectOptions(select, 'NEURO002');
    await waitFor(() => {
      // avg_age 48.1 is unique to NEURO002 and won't appear in CARDIO001 data
      expect(screen.getByText(/48\.1 yrs/i)).toBeInTheDocument();
    });
  });

  it('calls onStudyChange when a different study is selected', async () => {
    const user = userEvent.setup();
    const onStudyChange = vi.fn();
    render(<ParticipantSummary onStudyChange={onStudyChange} />);

    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'NEURO002');
    expect(onStudyChange).toHaveBeenCalledWith('NEURO002');
  });
});

// ---------------------------------------------------------------------------
// Loaded state — stat cards
// ---------------------------------------------------------------------------
describe('ParticipantSummary — stat cards', () => {
  it('renders Total Participants stat card', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText(/total participants/i)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders Avg Age stat card', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText(/avg age/i)).toBeInTheDocument();
    expect(screen.getByText(/54\.3 yrs/i)).toBeInTheDocument();
  });

  it('renders Age Range stat card', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText(/age range/i)).toBeInTheDocument();
    expect(screen.getByText(/32.*78 yrs/i)).toBeInTheDocument();
  });

  it('renders Data Start and Data End stat cards with formatted dates', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText(/data start/i)).toBeInTheDocument();
    expect(screen.getByText(/jan 15, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/data end/i)).toBeInTheDocument();
    expect(screen.getByText(/dec 30, 2025/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loaded state — gender breakdown table
// ---------------------------------------------------------------------------
describe('ParticipantSummary — gender breakdown', () => {
  it('renders gender breakdown table with correct rows', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
  });

  it('shows "No gender data available" when gender_breakdown is empty', async () => {
    server.use(
      http.get('/api/participants/summary', () =>
        HttpResponse.json({
          ...mockParticipantData,
          data: [{ ...mockParticipantData.data[0], gender_breakdown: [] }],
        })
      )
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/no gender data available/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Loaded state — site distribution table
// ---------------------------------------------------------------------------
describe('ParticipantSummary — site distribution', () => {
  it('renders site distribution table with correct rows', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText('Boston General')).toBeInTheDocument();
    expect(screen.getByText('Boston, MA')).toBeInTheDocument();
  });

  it('shows "No site data available" when site_distribution is empty', async () => {
    server.use(
      http.get('/api/participants/summary', () =>
        HttpResponse.json({
          ...mockParticipantData,
          data: [{ ...mockParticipantData.data[0], site_distribution: [] }],
        })
      )
    );
    render(<ParticipantSummary />);
    await waitFor(() => {
      expect(screen.getByText(/no site data available/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Shareable link / clipboard
// ---------------------------------------------------------------------------
describe('ParticipantSummary — shareable link', () => {
  it('displays a shareable link containing study_id', async () => {
    render(<ParticipantSummary />);
    await screen.findByRole('combobox');
    expect(screen.getByText(/page=participants&study=CARDIO001/)).toBeInTheDocument();
  });

  it('calls clipboard.writeText when Copy button is clicked', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText },
    });

    render(<ParticipantSummary />);
    const copyBtn = await screen.findByRole('button', { name: /copy/i });
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('page=participants&study=CARDIO001')
    );
  });
});
