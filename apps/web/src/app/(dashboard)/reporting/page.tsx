'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  CRMEmptyState,
  CRMModuleShell,
  CRMPageHeader,
  CRMSidePanel,
  CRMTableShell,
} from '@/components/ui/crm';

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
    // Show the list row immediately so the panel reflects the click even if the
    // run below is slow or fails — previously a failed drill-in left the
    // previous report on screen with no indication anything had happened.
    setActiveReport(report);
    try {
      const res = await fetch(`/api/reporting/reports/${report.id}`);
      if (!res.ok) return;
      const full = await res.json();
      // Unwrap the envelope. Storing `full` put { success, data } into state, so
      // every field read (`activeReport.rows`, `.name`) was undefined and the
      // table always fell through to its "no data" branch.
      if (full?.data) setActiveReport(full.data);
    } catch {
      /* keep the list row on screen; the panel's empty state covers it */
    }
  };

  return (
    <CRMModuleShell
      sidebar={
      <CRMSidePanel title="Reports">
        <div className="space-y-1">
          {loading
            ? [1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-container-high" />)
            : reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectReport(r)}
                  className={`w-full rounded-lg px-3 py-2 text-start text-sm ${
                    activeReport?.id === r.id
                      ? 'bg-primary-container font-medium text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {r.name}
                </button>
              ))}
          {!loading && reports.length === 0 ? <p className="px-2 text-xs text-on-surface-variant">No reports yet</p> : null}
        </div>
      </CRMSidePanel>
      }
    >
        {!activeReport ? (
          <>
            <CRMPageHeader icon={BarChart3} title="Reports" />
            <CRMEmptyState
              icon={BarChart3}
              title="Select a report"
              description="Choose a report from the sidebar to view its data"
            />
          </>
        ) : (
          <div>
            <CRMPageHeader
              icon={BarChart3}
              title={activeReport.name}
              description={activeReport.description}
              badges={<span className="text-xs text-on-surface-variant">Updated {new Date(activeReport.updatedAt).toLocaleDateString()}</span>}
            />
            {activeReport.data && activeReport.data.length > 0 ? (
              <CRMTableShell className="mt-6">
                <table className="w-full text-sm">
                  <thead className="border-b border-outline-variant bg-surface-container-low">
                    <tr>
                      {Object.keys(activeReport.data[0]).map((col) => (
                        <th key={col} className="px-4 py-3 text-start font-medium capitalize text-on-surface-variant">
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {activeReport.data.map((row, i) => (
                      <tr key={`row-${i}`} className="hover:bg-surface-container-low">
                        {Object.values(row).map((val, j) => (
                          <td key={`cell-${i}-${j}`} className="px-4 py-3 text-on-surface">
                            {val === null || val === undefined ? '—' : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CRMTableShell>
            ) : (
              <CRMEmptyState icon={BarChart3} title="No data in this report yet" />
            )}
          </div>
        )}
    </CRMModuleShell>
  );
}
