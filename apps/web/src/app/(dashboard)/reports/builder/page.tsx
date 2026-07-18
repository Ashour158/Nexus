'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usePrompt } from '@/hooks/use-confirm';
import { Download, Play, Save } from 'lucide-react';
import { apiClients } from '@/lib/api-client';

type ReportRow = Record<string, unknown>;

export default function ReportBuilderPage() {
  const searchParams = useSearchParams();
  const { prompt, PromptDialog } = usePrompt();

  const [objectType] = useState('deals');
  const [columns] = useState<string[]>(['name', 'amount', 'stageId', 'ownerId']);
  const [results, setResults] = useState<ReportRow[]>([]);
  const [, setTotal] = useState(0);
  const [, setShowSave] = useState(false);

  const scheduleReportId = searchParams.get('schedule');

  const runMutation = useMutation({
    mutationFn: async () =>
      apiClients.reporting.post<{ rows: ReportRow[]; total: number }>('/saved-reports/run', {
        objectType,
        columns,
        filters: [],
        groupBy: undefined,
        sortBy: 'createdAt',
        sortDir: 'desc',
      }),
    onSuccess: (data) => {
      setResults(data.rows ?? []);
      setTotal(data.total ?? 0);
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (email: string) => {
      const id = scheduleReportId;
      if (!id) throw new Error('Missing report id');
      return apiClients.reporting.post(`/saved-reports/${id}/schedules`, {
        cronExpr: '0 9 * * 1',
        recipients: [email],
        format: 'csv',
        subject: 'Scheduled CRM report',
      });
    },
  });

  const exportCsv = () => {
    const header = columns.join(',');
    const rowsCsv = results.map((r) => columns.map((c) => String(r[c] ?? '')).join(','));
    const blob = new Blob([[header, ...rowsCsv].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${objectType}_report.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-surface-container-low dark:bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface ">Report Builder</h1>
        <div className="flex gap-2">
          {scheduleReportId && (
            <button
              type="button"
              onClick={async () => {
                const email = await prompt('Recipient email:', 'Schedule Report');
                if (email) scheduleMutation.mutate(email);
              }}
              disabled={scheduleMutation.isPending}
              className="px-3 py-2 rounded-lg border border-outline-variant text-sm"
            >
              {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule weekly email'}
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={results.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-outline-variant dark:border-outline-variant text-sm hover:bg-surface-container-high dark:hover:bg-surface-container-highest disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowSave(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-primary/40 bg-primary-container text-primary text-sm hover:bg-primary-container "
          >
            <Save className="h-4 w-4" /> Save Report
          </button>
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> Run Report
          </button>
        </div>
      </div>
      {PromptDialog}
    </div>
  );
}
