'use client';

import { useEffect, useState } from 'react';

interface ReportData {
  id: string;
  name: string;
  description?: string;
  type: string;
  data: Record<string, unknown>[];
  updatedAt: string;
}

export default function ReportingPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [activeReport, setActiveReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reporting/reports')
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || [];
        setReports(list);
        if (list.length > 0) setActiveReport(list[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectReport = async (report: ReportData) => {
    const res = await fetch(`/api/reporting/reports/${report.id}`);
    const full = await res.json();
    setActiveReport(full);
  };

  return (
    <div className="flex gap-6 p-6">
      <div className="w-64 shrink-0">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Reports</h2>
        <div className="space-y-1">
          {loading
            ? [1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)
            : reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectReport(r)}
                  className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                    activeReport?.id === r.id
                      ? 'bg-indigo-50 font-medium text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {r.name}
                </button>
              ))}
          {!loading && reports.length === 0 ? <p className="px-2 text-xs text-gray-400">No reports yet</p> : null}
        </div>
      </div>

      <div className="flex-1">
        {!activeReport ? (
          <div className="py-16 text-center">
            <p className="mb-2 text-4xl">📊</p>
            <p className="font-medium text-gray-600">Select a report</p>
            <p className="mt-1 text-sm text-gray-400">Choose a report from the sidebar to view its data</p>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <h1 className="text-xl font-bold text-gray-900">{activeReport.name}</h1>
              {activeReport.description ? <p className="mt-1 text-sm text-gray-500">{activeReport.description}</p> : null}
              <p className="mt-1 text-xs text-gray-400">
                Updated {new Date(activeReport.updatedAt).toLocaleDateString()}
              </p>
            </div>
            {activeReport.data && activeReport.data.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {Object.keys(activeReport.data[0]).map((col) => (
                        <th key={col} className="px-4 py-3 text-start font-medium capitalize text-gray-500">
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeReport.data.map((row, i) => (
                      <tr key={`row-${i}`} className="hover:bg-gray-50">
                        {Object.values(row).map((val, j) => (
                          <td key={`cell-${i}-${j}`} className="px-4 py-3 text-gray-700">
                            {val === null || val === undefined ? '—' : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 py-12 text-center">
                <p className="mb-2 text-3xl">📭</p>
                <p className="text-sm text-gray-500">No data in this report yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
