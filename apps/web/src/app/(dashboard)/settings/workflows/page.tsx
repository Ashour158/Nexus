'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClients } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

type WorkflowCard = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  updatedAt: string;
};

type ExecutionRow = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
};

export default function SettingsWorkflowsPage(): JSX.Element {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<WorkflowCard | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('deal.won');
  const [conditionField, setConditionField] = useState('');
  const [conditionValue, setConditionValue] = useState('');
  const [actionType, setActionType] = useState('EMAIL');
  const [actionConfig, setActionConfig] = useState('{"subject":"Congrats","body":"Deal won"}');

  const workflowsQuery = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await apiClients.workflow.get<{ data: WorkflowCard[] }>('/workflows', {
        params: { limit: 100 },
      });
      return (res as unknown as { data?: WorkflowCard[] }).data ?? [];
    },
  });

  const executionsQuery = useQuery({
    queryKey: ['workflow-history', historyFor?.id ?? ''],
    queryFn: async () => {
      if (!historyFor) return [];
      const res = await apiClients.workflow.get<{ data: ExecutionRow[] }>('/executions', {
        params: { limit: 20 },
      });
      return (res as unknown as { data?: ExecutionRow[] }).data ?? [];
    },
    enabled: Boolean(historyFor),
  });

  const createWorkflow = useMutation({
    mutationFn: (payload: unknown) => apiClients.workflow.post('/workflows', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
  const activateWorkflow = useMutation({
    mutationFn: (id: string) => apiClients.workflow.post(`/workflows/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
  const deactivateWorkflow = useMutation({
    mutationFn: (id: string) => apiClients.workflow.post(`/workflows/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
  const testRun = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiClients.workflow.post(`/workflows/${id}/test-run`, { payload }),
  });

  const cards = useMemo(() => workflowsQuery.data ?? [], [workflowsQuery.data]);

  async function onCreateWorkflow() {
    const triggerNodeId = 'n1';
    const conditionNodeId = 'n2';
    const actionNodeId = 'n3';
    const endNodeId = 'n4';
    const actionCfg = safeJson(actionConfig);
    await createWorkflow.mutateAsync({
      name,
      trigger,
      triggerConditions: {},
      nodes: [
        { id: triggerNodeId, type: 'TRIGGER' },
        {
          id: conditionNodeId,
          type: 'CONDITION',
          config: {
            field: conditionField || undefined,
            operator: 'eq',
            value: conditionValue || undefined,
            trueNodeId: actionNodeId,
            falseNodeId: endNodeId,
          },
        },
        { id: actionNodeId, type: actionType, config: actionCfg },
        { id: endNodeId, type: 'END' },
      ],
      edges: [
        { from: triggerNodeId, to: conditionNodeId },
        { from: conditionNodeId, to: actionNodeId, condition: 'true' },
        { from: conditionNodeId, to: endNodeId, condition: 'false' },
        { from: actionNodeId, to: endNodeId },
      ],
    });
    setWizardOpen(false);
    setStep(1);
    setName('');
    setConditionField('');
    setConditionValue('');
  }

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflow Automation</h1>
          <p className="text-sm text-slate-600">Build and run trigger-based automation flows.</p>
        </div>
        <Button type="button" onClick={() => setWizardOpen(true)}>
          + New Workflow
        </Button>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((w) => (
          <div key={w.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">{w.name}</h2>
                <p className="text-xs text-slate-500">Trigger: {w.trigger}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                {w.isActive ? 'active' : 'inactive'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Last updated {formatDateTime(w.updatedAt)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => (w.isActive ? deactivateWorkflow.mutate(w.id) : activateWorkflow.mutate(w.id))}>
                {w.isActive ? 'Pause' : 'Activate'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  const result = await testRun.mutateAsync({ id: w.id, payload: { dealName: 'Demo', amount: 1000 } });
                  setTestResult(JSON.stringify(result, null, 2));
                }}
              >
                Test Run
              </Button>
              <Button type="button" variant="ghost" onClick={() => setHistoryFor(w)}>
                Execution History
              </Button>
            </div>
          </div>
        ))}
      </section>

      {wizardOpen ? (
        <Modal title="Workflow Wizard" onClose={() => setWizardOpen(false)}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Step {step} / 4</p>
            {step === 1 ? (
              <>
                <Input placeholder="Workflow name" value={name} onChange={(e) => setName(e.target.value)} />
                <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm">
                  <option value="deal.won">Deal Won</option>
                  <option value="deal.lost">Deal Lost</option>
                  <option value="deal.stage_changed">Stage Changed</option>
                  <option value="lead.created">Lead Created</option>
                  <option value="lead.qualified">Lead Qualified</option>
                  <option value="activity.overdue">Activity Overdue</option>
                </select>
              </>
            ) : null}
            {step === 2 ? (
              <>
                <Input placeholder="Field (e.g. amount)" value={conditionField} onChange={(e) => setConditionField(e.target.value)} />
                <Input placeholder="Value equals..." value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} />
              </>
            ) : null}
            {step === 3 ? (
              <>
                <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm">
                  <option value="EMAIL">Send Email</option>
                  <option value="CREATE_ACTIVITY">Create Activity</option>
                  <option value="CREATE_TASK">Create Task</option>
                  <option value="NOTIFY">Send Notification</option>
                  <option value="SET_FIELD">Set Field</option>
                  <option value="WEBHOOK">Webhook</option>
                </select>
                <Textarea rows={5} value={actionConfig} onChange={(e) => setActionConfig(e.target.value)} />
              </>
            ) : null}
            {step === 4 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <p><strong>Name:</strong> {name}</p>
                <p><strong>Trigger:</strong> {trigger}</p>
                <p><strong>Condition:</strong> {conditionField || '(none)'} = {conditionValue || '(none)'}</p>
                <p><strong>Action:</strong> {actionType}</p>
              </div>
            ) : null}
            <div className="flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
                Back
              </Button>
              {step < 4 ? (
                <Button type="button" onClick={() => setStep((s) => Math.min(4, s + 1))}>
                  Next
                </Button>
              ) : (
                <Button type="button" isLoading={createWorkflow.isPending} onClick={onCreateWorkflow}>
                  Review + Activate
                </Button>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {historyFor ? (
        <Modal title={`Execution history — ${historyFor.name}`} onClose={() => setHistoryFor(null)}>
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Triggered at</th>
                  <th className="px-2 py-1 text-left">Completed</th>
                </tr>
              </thead>
              <tbody>
                {(executionsQuery.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-2 py-1">{e.status}</td>
                    <td className="px-2 py-1">{formatDateTime(e.startedAt)}</td>
                    <td className="px-2 py-1">{e.completedAt ? formatDateTime(e.completedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {testResult ? (
        <Modal title="Test run result" onClose={() => setTestResult(null)}>
          <pre className="max-h-96 overflow-auto rounded bg-slate-950 p-3 text-xs text-emerald-100">{testResult}</pre>
        </Modal>
      ) : null}
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-2 py-1 text-xs">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}
