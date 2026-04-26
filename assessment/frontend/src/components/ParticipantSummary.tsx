import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ParticipantSummaryResponse, ParticipantSummary } from '../types';

const GENDER_COLORS = ['#3b82f6', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b'];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

interface Props {
  initialStudyId?: string;
  onStudyChange?: (studyId: string) => void;
}

function ParticipantSummary({ initialStudyId, onStudyChange }: Props) {
  const [allData, setAllData] = useState<ParticipantSummaryResponse | null>(null);
  const [selectedStudyId, setSelectedStudyId] = useState<string>(initialStudyId ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/participants/summary');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result: ParticipantSummaryResponse = await response.json();
        setAllData(result);
        // Select first study if none pre-selected
        if (!selectedStudyId && result.data.length > 0) {
          setSelectedStudyId(result.data[0].study_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStudyChange = (studyId: string) => {
    setSelectedStudyId(studyId);
    onStudyChange?.(studyId);
  };

  const study: ParticipantSummary | undefined = allData?.data.find(
    d => d.study_id === selectedStudyId
  );

  const formatDate = (ts: string) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Participant Summary Report</h2>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-8 border-solid border-blue-600 border-r-transparent" />
          <p className="mt-4 text-gray-600 font-medium">Loading participant data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm font-medium text-red-800">Error loading data</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!allData || allData.data.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">No participant data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + study selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Participant Summary Report</h2>
            <p className="mt-1 text-sm text-gray-500">
              Aggregate cohort characteristics by study
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="study-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Select study
            </label>
            <select
              id="study-select"
              value={selectedStudyId}
              onChange={e => handleStudyChange(e.target.value)}
              className="block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {allData.data.map(d => (
                <option key={d.study_id} value={d.study_id}>
                  {d.study_name} ({d.study_id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Shareable link */}
        {study && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-gray-500">Shareable link:</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 select-all">
              {window.location.origin}/?page=participants&study={study.study_id}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/?page=participants&study=${study.study_id}`
                );
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {study && (
        <>
          {/* Summary stat cards */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{study.study_name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <StatCard label="Total Participants" value={study.total_participants.toLocaleString()} />
              <StatCard label="Avg Age" value={`${study.avg_age} yrs`} />
              <StatCard label="Age Range" value={`${study.min_age}–${study.max_age} yrs`} />
              <StatCard
                label="Avg Measurements / Participant"
                value={Number(study.avg_measurements_per_participant).toLocaleString()}
              />
              <StatCard label="Data Start" value={formatDate(study.data_start_date)} />
              <StatCard label="Data End" value={formatDate(study.data_end_date)} />
              <StatCard label="Sites" value={study.site_distribution?.length ?? '—'} />
              <StatCard label="Gender Groups" value={study.gender_breakdown?.length ?? '—'} />
            </div>
          </div>

          {/* Gender breakdown + Site distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gender breakdown */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Gender Breakdown</h3>
              {study.gender_breakdown && study.gender_breakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={study.gender_breakdown}
                        dataKey="count"
                        nameKey="gender"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ gender, percent }) =>
                          `${gender} ${(percent * 100).toFixed(1)}%`
                        }
                      >
                        {study.gender_breakdown.map((_, i) => (
                          <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => val.toLocaleString()} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 text-left font-medium text-gray-500">Gender</th>
                        <th className="py-2 text-right font-medium text-gray-500">Participants</th>
                        <th className="py-2 text-right font-medium text-gray-500">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {study.gender_breakdown.map((g, i) => (
                        <tr key={g.gender} className="border-b border-gray-100">
                          <td className="py-2 flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded-full"
                              style={{ backgroundColor: GENDER_COLORS[i % GENDER_COLORS.length] }}
                            />
                            {g.gender || 'Unknown'}
                          </td>
                          <td className="py-2 text-right">{g.count.toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-500">
                            {((g.count / study.total_participants) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-gray-500 text-sm">No gender data available.</p>
              )}
            </div>

            {/* Site distribution */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Site Distribution</h3>
              {study.site_distribution && study.site_distribution.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 text-left font-medium text-gray-500">Site</th>
                        <th className="py-2 text-left font-medium text-gray-500">Location</th>
                        <th className="py-2 text-right font-medium text-gray-500">Participants</th>
                        <th className="py-2 text-right font-medium text-gray-500">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {study.site_distribution.map(s => (
                        <tr key={s.site_id} className="border-b border-gray-100">
                          <td className="py-2">
                            <div className="font-medium text-gray-900">{s.site_name}</div>
                            <div className="text-xs text-gray-400">{s.site_id}</div>
                          </td>
                          <td className="py-2 text-gray-600">{s.site_location}</td>
                          <td className="py-2 text-right">{s.participant_count.toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-500">
                            {((s.participant_count / study.total_participants) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No site data available.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ParticipantSummary;
