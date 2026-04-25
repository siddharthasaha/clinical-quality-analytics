import { useState, useEffect } from 'react';
import QualityDashboard from './components/QualityDashboard';
import StudyOverview from './components/StudyOverview';
import ParticipantSummary from './components/ParticipantSummary';

type Page = 'quality' | 'overview' | 'participants';

function getInitialState(): { page: Page; studyId: string } {
  const params = new URLSearchParams(window.location.search);
  const page = (params.get('page') as Page) ?? 'quality';
  const studyId = params.get('study') ?? '';
  return { page: (['quality', 'overview', 'participants'] as Page[]).includes(page) ? page : 'quality', studyId };
}

function App() {
  const initial = getInitialState();
  const [currentPage, setCurrentPage] = useState<Page>(initial.page);
  const [participantStudyId, setParticipantStudyId] = useState<string>(initial.studyId);

  // Keep URL in sync with current page/study
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', currentPage);
    if (currentPage === 'participants' && participantStudyId) {
      params.set('study', participantStudyId);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [currentPage, participantStudyId]);

  const navItem = (page: Page, label: string) => (
    <button
      onClick={() => setCurrentPage(page)}
      className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
        currentPage === page
          ? 'border-blue-500 text-gray-900'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-2xl font-bold text-gray-900">
                  Clinical Quality Dashboard
                </h1>
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                {navItem('overview', 'Study Overview')}
                {navItem('quality', 'Quality Dashboard')}
                {navItem('participants', 'Participant Summary')}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div style={{ display: currentPage === 'overview' ? 'block' : 'none' }}>
          <StudyOverview />
        </div>
        {currentPage === 'quality' && <QualityDashboard />}
        {currentPage === 'participants' && (
          <ParticipantSummary
            initialStudyId={participantStudyId}
            onStudyChange={setParticipantStudyId}
          />
        )}
      </main>
    </div>
  );
}

export default App;
