'use client';

import { useMemo, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiStore } from '@/stores/ui.store';
import { formatDateTime } from '@/lib/format';

interface Workflow {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  createdAt: string;
}

interface Execution {
  id: string;
  workflowId: string;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING';
  startedAt: string;
  completedAt: string | null;
}

function statusClass(status: Execution['status']): string {
  if (status === 'RUNNING') return 'bg-primary-container text-primary';
  if (status === 'COMPLETED') return 'bg-success-container text-success';
  if (status === 'FAILED') return 'bg-error-container text-error';
  if (status === 'PAUSED') return 'bg-warning-container text-warning';
  if (status === 'CANCELLED') return 'bg-surface-container-highest text-on-surface';
  return 'bg-surface-container-high text-on-surface';
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function WorkflowsPage(): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useUiStore((s) => s.pushToast);
  const [tab, setTab] = useState<'workflows' | 'executions'>('workflows');
  const workflowsQuery = useQuery({
    queryKey: ['workflows', 'list'],
    queryFn: () =>
      apiClients.workflow.get<Paginated<Workflow>>('/workflows', {
        params: { page: 1, limit: 100 },
      }),
  });
  const executionsQuery = useQuery({
    queryKey: ['workflows', 'executions'],
    queryFn: () =>
      apiClients.workflow.get<Paginated<Execution>>('/executions', {
        params: { page: 1, limit: 100 },
      }),
  });

  const toggle = useMutation({
    mutationFn: ({ workflowId, active }: { workflowId: string; active: boolean }) =>
      active
        ? apiClients.workflow.post(`/workflows/${workflowId}/activate`, {})
        : apiClients.workflow.post(`/workflows/${workflowId}/deactivate`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['workflows', 'list'] });
    },
  });
  const testRun = useMutation({
    mutationFn: (workflowId: string) => apiClients.workflow.post(`/workflows/${workflowId}/test-run`, { payload: {} }),
    onSuccess: () => toast({ variant: 'success', title: 'Test run executed' }),
    onError: (err) =>
      toast({
        variant: 'error',
        title: 'Test run failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      }),
  });

  const workflows = useMemo(
    () => workflowsQuery.data?.data ?? [],
    [workflowsQuery.data]
  );
  const executions = useMemo(
    () => executionsQuery.data?.data ?? [],
    [executionsQuery.data]
  );
  const workflowNames = useMemo(
    () =>
      new Map<string, string>(
        workflows.map((workflow) => [workflow.id, workflow.name])
      ),
    [workflows]
  );

  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Workflows</h1>
          <p className="text-sm text-on-surface-variant">Automation workflows and recent execution history.</p>
        </div>
        <Button onClick={() => router.push('/workflows/new')}>+ New Workflow</Button>
      </header>
      <div className="inline-flex rounded-md border border-outline-variant bg-surface p-0.5">
        <button type="button" onClick={() => setTab('workflows')} className={`rounded px-3 py-1 text-sm ${tab === 'workflows' ? 'bg-inverse-surface text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>Workflows</button>
        <button type="button" onClick={() => setTab('executions')} className={`rounded px-3 py-1 text-sm ${tab === 'executions' ? 'bg-inverse-surface text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>Executions</button>
      </div>

      {tab === 'workflows' ? (
        <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
          {workflowsQuery.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : workflows.length === 0 ? (
            <p className="p-8 text-center text-sm text-on-surface-variant">No workflows configured.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-start text-xs uppercase text-on-surface-variant">
                <tr><th className="px-3 py-2">Name</th><th>Trigger</th><th>Status</th><th>Created</th><th className="text-end pe-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {workflows.map((workflow) => (
                  <tr key={workflow.id}>
                    <td className="px-3 py-2 font-medium">{workflow.name}</td>
                    <td>{workflow.trigger}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${workflow.isActive ? 'bg-success-container text-success' : 'bg-surface-container-high text-on-surface'}`}>
                        {workflow.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDateTime(workflow.createdAt)}</td>
                    <td className="pe-3 text-end">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => router.push(`/workflows/${workflow.id}`)}
                        >
                          Builder
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            toggle.mutate({ workflowId: workflow.id, active: !workflow.isActive })
                          }
                          disabled={toggle.isPending}
                        >
                          {workflow.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          onClick={() => testRun.mutate(workflow.id)}
                          disabled={testRun.isPending}
                        >
                          Test Run
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
          {executionsQuery.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : executions.length === 0 ? (
            <p className="p-8 text-center text-sm text-on-surface-variant">No executions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-start text-xs uppercase text-on-surface-variant">
                <tr><th className="px-3 py-2">Workflow</th><th>Status</th><th>Started At</th><th>Duration</th></tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {executions.map((execution) => {
                  const durationMs = execution.completedAt
                    ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
                    : Date.now() - new Date(execution.startedAt).getTime();
                  const seconds = Math.max(0, Math.floor(durationMs / 1000));
                  return (
                    <tr key={execution.id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {workflowNames.get(execution.workflowId) ?? execution.workflowId}
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(execution.status)}`}>{execution.status}</span>
                      </td>
                      <td>{formatDateTime(execution.startedAt)}</td>
                      <td>{seconds}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
