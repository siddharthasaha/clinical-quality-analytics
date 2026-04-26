import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../../App';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search, pathname: '/' },
  });
}

beforeEach(() => {
  setSearch('');
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Default page
// ---------------------------------------------------------------------------
describe('App — default page', () => {
  it('renders Quality Dashboard by default when no ?page= param', async () => {
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(/quality score distribution by study/i)
      ).toBeInTheDocument();
    });
  });

  it('defaults to quality page for unknown ?page= value', async () => {
    setSearch('?page=unknown');
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(/quality score distribution by study/i)
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
describe('App — navigation', () => {
  it('navigates to Study Overview on nav click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /study overview/i }));
    await waitFor(() => {
      expect(screen.getByText(/summary of all active clinical studies/i)).toBeInTheDocument();
    });
  });

  it('navigates to Participant Summary on nav click', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /participant summary/i }));
    await waitFor(() => {
      expect(screen.getByText(/aggregate cohort characteristics/i)).toBeInTheDocument();
    });
  });

  it('navigates back to Quality Dashboard from another page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /study overview/i }));
    await user.click(screen.getByRole('button', { name: /quality dashboard/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/quality score distribution by study/i)
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// URL hydration
// ---------------------------------------------------------------------------
describe('App — URL hydration', () => {
  it('renders Study Overview when ?page=overview', async () => {
    setSearch('?page=overview');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/summary of all active clinical studies/i)).toBeInTheDocument();
    });
  });

  it('renders Participant Summary when ?page=participants', async () => {
    setSearch('?page=participants');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/aggregate cohort characteristics/i)).toBeInTheDocument();
    });
  });

  it('renders Quality Dashboard when ?page=quality', async () => {
    setSearch('?page=quality');
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(/quality score distribution by study/i)
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// URL sync on navigation
// ---------------------------------------------------------------------------
describe('App — URL sync', () => {
  it('calls replaceState with ?page=overview when navigating to Study Overview', async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<App />);
    await user.click(screen.getByRole('button', { name: /study overview/i }));
    expect(replaceState).toHaveBeenCalledWith(
      null, '', expect.stringContaining('page=overview')
    );
  });

  it('calls replaceState with ?page=participants when navigating to Participant Summary', async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<App />);
    await user.click(screen.getByRole('button', { name: /participant summary/i }));
    expect(replaceState).toHaveBeenCalledWith(
      null, '', expect.stringContaining('page=participants')
    );
  });
});

// ---------------------------------------------------------------------------
// Nav bar branding
// ---------------------------------------------------------------------------
describe('App — nav bar', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText(/clinical quality dashboard/i)).toBeInTheDocument();
  });

  it('renders all three nav buttons', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /study overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quality dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /participant summary/i })).toBeInTheDocument();
  });
});
