'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiStore } from '@/stores/ui.store';

type NodeType =
  | 'TRIGGER' | 'CONDITION' | 'WAIT' | 'ACTION' | 'EMAIL'
  | 'WEBHOOK' | 'SET_FIELD' | 'CREATE_ACTIVITY' | 'CREATE_TASK'
  | 'ASSIGN' | 'NOTIFY' | 'FORK' | 'JOIN' | 'END'
  | 'APPROVAL_REQUEST' | 'VALIDATION_RULE' | 'SLA_CHECK';

interface WorkflowNode {
  id: string;
  type: NodeType;
  config?: Record<string, unknown>;
}

interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: string;
  isActive: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const NODE_COLORS: Record<NodeType, string> = {
  TRIGGER: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CONDITION: 'bg-amber-100 text-amber-700 border-amber-300',
  WAIT: 'bg-slate-100 text-slate-700 border-slate-300',
  ACTION: 'bg-blue-100 text-blue-700 border-blue-300',
  EMAIL: 'bg-purple-100 text-purple-700 border-purple-300',
  WEBHOOK: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  SET_FIELD: 'bg-pink-100 text-pink-700 border-pink-300',
  CREATE_ACTIVITY: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  CREATE_TASK: 'bg-teal-100 text-teal-700 border-teal-300',
  ASSIGN: 'bg-orange-100 text-orange-700 border-orange-300',
  NOTIFY: 'bg-rose-100 text-rose-700 border-rose-300',
  FORK: 'bg-lime-100 text-lime-700 border-lime-300',
  JOIN: 'bg-violet-100 text-violet-700 border-violet-300',
  END: 'bg-red-100 text-red-700 border-red-300',
  APPROVAL_REQUEST: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  VALIDATION_RULE: 'bg-sky-100 text-sky-700 border-sky-300',
  SLA_CHECK: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',
};

// Branch-capable node types produce two labelled outgoing edges so the engine
// can route on the edge `condition` label (matching the backend node handlers).
const NODE_BRANCHES: Partial<Record<NodeType, [string, string]>> = {
  APPROVAL_REQUEST: ['approved', 'rejected'],
  VALIDATION_RULE: ['valid', 'invalid'],
  SLA_CHECK: ['breached', 'within'],
};

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// Positive-branch labels render green, negative-branch labels render red.
const POSITIVE_EDGE_LABELS = new Set(['true', 'approved', 'valid', 'within']);
const NEGATIVE_EDGE_LABELS = new Set(['false', 'rejected', 'invalid', 'breached']);

function edgeColor(condition?: string): string {
  if (!condition) return '#94a3b8';
  const c = condition.trim().toLowerCase();
  if (POSITIVE_EDGE_LABELS.has(c)) return '#10b981';
  if (NEGATIVE_EDGE_LABELS.has(c)) return '#ef4444';
  return '#64748b';
}

export default function WorkflowCanvasPage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const toast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();

  const isNew = workflowId === 'new';

  const workflowQuery = useQuery<Workflow>({
    queryKey: ['workflows', 'detail', workflowId],
    queryFn: () => apiClients.workflow.get<Workflow>(`/workflows/${workflowId}`),
    enabled: !isNew,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('deal.created');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useMemo(() => {
    if (workflowQuery.data && !isNew) {
      setName(workflowQuery.data.name);
      setDescription(workflowQuery.data.description ?? '');
      setTrigger(workflowQuery.data.trigger);
      setNodes(workflowQuery.data.nodes ?? []);
      setEdges(workflowQuery.data.edges ?? []);
    }
    if (isNew) {
      const triggerNode: WorkflowNode = { id: generateId(), type: 'TRIGGER', config: { event: 'deal.created' } };
      setNodes([triggerNode]);
      setEdges([]);
      setName('New Workflow');
      setTrigger('deal.created');
    }
  }, [workflowQuery.data, isNew]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description, trigger, nodes, edges };
      if (isNew) {
        return apiClients.workflow.post<Workflow>('/workflows', payload);
      }
      return apiClients.workflow.patch<Workflow>(`/workflows/${workflowId}`, payload);
    },
    onSuccess: (data) => {
      toast({ variant: 'success', title: isNew ? 'Workflow created' : 'Workflow saved' });
      qc.invalidateQueries({ queryKey: ['workflows', 'list'] });
      if (isNew && data.id) {
        router.replace(`/workflows/${data.id}`);
      }
    },
    onError: (err) => {
      toast({ variant: 'error', title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error' });
    },
  });

  const addNode = (type: NodeType) => {
    const newNode: WorkflowNode = { id: generateId(), type, config: {} };
    setNodes((prev) => [...prev, newNode]);
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setEdges((prev) => [...prev, { from: lastNode.id, to: newNode.id }]);
    }
    setSelectedNodeId(newNode.id);
  };

  const addConditionBranch = (nodeId: string) => {
    const trueNode: WorkflowNode = { id: generateId(), type: 'ACTION', config: {} };
    const falseNode: WorkflowNode = { id: generateId(), type: 'ACTION', config: {} };
    setNodes((prev) => [...prev, trueNode, falseNode]);
    setEdges((prev) => [
      ...prev,
      { from: nodeId, to: trueNode.id, condition: 'true' },
      { from: nodeId, to: falseNode.id, condition: 'false' },
    ]);
  };

  // Adds two labelled branch edges for branch-capable nodes (APPROVAL_REQUEST,
  // VALIDATION_RULE, SLA_CHECK). The labels become the edge `condition` the
  // engine routes on (e.g. approved/rejected).
  const addLabelledBranches = (nodeId: string, labels: [string, string]) => {
    const nodeA: WorkflowNode = { id: generateId(), type: 'ACTION', config: {} };
    const nodeB: WorkflowNode = { id: generateId(), type: 'ACTION', config: {} };
    setNodes((prev) => [...prev, nodeA, nodeB]);
    setEdges((prev) => [
      ...prev,
      { from: nodeId, to: nodeA.id, condition: labels[0] },
      { from: nodeId, to: nodeB.id, condition: labels[1] },
    ]);
  };

  const removeNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const updateNodeConfig = (id: string, key: string, value: unknown) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n))
    );
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    let y = 20;
    // Simple vertical layout
    for (const node of nodes) {
      map.set(node.id, { x: 200, y });
      y += 90;
    }
    return map;
  }, [nodes]);

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.push('/workflows')}>
            ← Back
          </Button>
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-lg font-semibold"
              placeholder="Workflow name"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => saveMutation.mutate()}
            isLoading={saveMutation.isPending}
          >
            Save
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <aside className="w-48 overflow-y-auto border-r border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Nodes</p>
          <div className="space-y-1">
            {(['CONDITION', 'WAIT', 'ACTION', 'EMAIL', 'WEBHOOK', 'SET_FIELD', 'CREATE_ACTIVITY', 'CREATE_TASK', 'ASSIGN', 'NOTIFY', 'APPROVAL_REQUEST', 'VALIDATION_RULE', 'SLA_CHECK', 'FORK', 'JOIN', 'END'] as NodeType[]).map((type) => (
              <button
                key={type}
                onClick={() => addNode(type)}
                className="w-full rounded-md border px-2 py-1.5 text-left text-xs font-medium transition hover:opacity-80"
              >
                + {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div className="relative flex-1 overflow-auto bg-slate-50">
          {workflowQuery.isLoading && !isNew ? (
            <div className="p-8">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="mt-4 h-64" />
            </div>
          ) : (
            <svg className="absolute inset-0 h-full w-full" style={{ minHeight: Math.max(600, nodes.length * 100) }}>
              {edges.map((edge, i) => {
                const from = nodePositions.get(edge.from);
                const to = nodePositions.get(edge.to);
                if (!from || !to) return null;
                return (
                  <g key={i}>
                    <line
                      x1={from.x + 80}
                      y1={from.y + 30}
                      x2={to.x + 80}
                      y2={to.y}
                      stroke={edgeColor(edge.condition)}
                      strokeWidth={2}
                      strokeDasharray={edge.condition ? undefined : '4 4'}
                    />
                    {edge.condition && (
                      <text
                        x={(from.x + to.x) / 2 + 80}
                        y={(from.y + to.y) / 2 + 15}
                        fill={edgeColor(edge.condition)}
                        fontSize={10}
                        fontWeight={600}
                      >
                        {edge.condition}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {nodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`absolute w-40 cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition hover:shadow-md ${
                  NODE_COLORS[node.type]
                } ${selectedNodeId === node.id ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                style={{ left: pos.x, top: pos.y }}
              >
                <div className="flex items-center justify-between">
                  <span>{node.type}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
                {!!node.config?.field && (
                  <div className="mt-1 truncate text-[10px] opacity-75">{String(node.config.field)}</div>
                )}
                {node.type === 'CONDITION' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addConditionBranch(node.id);
                    }}
                    className="mt-1 text-[10px] underline"
                  >
                    + Add branches
                  </button>
                )}
                {NODE_BRANCHES[node.type] && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addLabelledBranches(node.id, NODE_BRANCHES[node.type]!);
                    }}
                    className="mt-1 text-[10px] underline"
                  >
                    + {NODE_BRANCHES[node.type]![0]}/{NODE_BRANCHES[node.type]![1]} branches
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Properties panel */}
        <aside className="w-64 overflow-y-auto border-l border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Properties</p>
          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600">Type</label>
                <p className="text-sm font-medium">{selectedNode.type}</p>
              </div>
              <div>
                <label className="text-xs text-slate-600">ID</label>
                <p className="font-mono text-[10px] text-slate-400">{selectedNode.id}</p>
              </div>
              {selectedNode.type === 'TRIGGER' && (
                <div>
                  <label className="text-xs text-slate-600">Trigger event</label>
                  <Input
                    value={String(selectedNode.config?.event ?? trigger)}
                    onChange={(e) => updateNodeConfig(selectedNode.id, 'event', e.target.value)}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}
              {selectedNode.type === 'CONDITION' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Field</label>
                    <Input
                      value={String(selectedNode.config?.field ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'field', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. amount"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Operator</label>
                    <select
                      value={String(selectedNode.config?.operator ?? 'eq')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'operator', e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      {['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'].map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Value</label>
                    <Input
                      value={String(selectedNode.config?.value ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'value', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </>
              )}
              {selectedNode.type === 'ACTION' && (
                <div>
                  <label className="text-xs text-slate-600">URL</label>
                  <Input
                    value={String(selectedNode.config?.url ?? '')}
                    onChange={(e) => updateNodeConfig(selectedNode.id, 'url', e.target.value)}
                    className="mt-1 h-8 text-xs"
                    placeholder="https://..."
                  />
                </div>
              )}
              {selectedNode.type === 'EMAIL' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Subject</label>
                    <Input
                      value={String(selectedNode.config?.subject ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'subject', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Body</label>
                    <textarea
                      value={String(selectedNode.config?.body ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'body', e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      rows={3}
                    />
                  </div>
                </>
              )}
              {selectedNode.type === 'WAIT' && (
                <div>
                  <label className="text-xs text-slate-600">Delay (days)</label>
                  <Input
                    type="number"
                    value={String(selectedNode.config?.delayDays ?? 1)}
                    onChange={(e) => updateNodeConfig(selectedNode.id, 'delayDays', Number(e.target.value))}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              )}
              {selectedNode.type === 'SET_FIELD' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Field</label>
                    <Input
                      value={String(selectedNode.config?.field ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'field', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Value</label>
                    <Input
                      value={String(selectedNode.config?.value ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'value', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                </>
              )}
              {selectedNode.type === 'APPROVAL_REQUEST' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Policy ID</label>
                    <Input
                      value={String(selectedNode.config?.policyId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'policyId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="optional — else matched by entity type"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Entity type</label>
                    <Input
                      value={String(selectedNode.config?.entityType ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityType', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. quote, deal, contract"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Entity ID</label>
                    <Input
                      value={String(selectedNode.config?.entityId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="record to request approval for"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Requester ID</label>
                    <Input
                      value={String(selectedNode.config?.requesterId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'requesterId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="who is requesting"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Notes</label>
                    <textarea
                      value={String(selectedNode.config?.notes ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'notes', e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                      rows={2}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Routes on <span className="font-medium text-emerald-600">approved</span> /{' '}
                    <span className="font-medium text-red-600">rejected</span> branch edges.
                  </p>
                </>
              )}
              {selectedNode.type === 'VALIDATION_RULE' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Pipeline ID</label>
                    <Input
                      value={String(selectedNode.config?.pipelineId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'pipelineId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">From stage ID</label>
                    <Input
                      value={String(selectedNode.config?.fromStageId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'fromStageId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">To stage ID</label>
                    <Input
                      value={String(selectedNode.config?.toStageId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'toStageId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Deal ID</label>
                    <Input
                      value={String(selectedNode.config?.dealId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'dealId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Routes on <span className="font-medium text-emerald-600">valid</span> /{' '}
                    <span className="font-medium text-red-600">invalid</span> branch edges.
                  </p>
                </>
              )}
              {selectedNode.type === 'SLA_CHECK' && (
                <>
                  <div>
                    <label className="text-xs text-slate-600">Entity type</label>
                    <Input
                      value={String(selectedNode.config?.entityType ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityType', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. deal, lead"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Entity ID</label>
                    <Input
                      value={String(selectedNode.config?.entityId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="record to check"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">SLA ID</label>
                    <Input
                      value={String(selectedNode.config?.slaId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'slaId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="optional — specific SLA definition"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Routes on <span className="font-medium text-red-600">breached</span> /{' '}
                    <span className="font-medium text-emerald-600">within</span> branch edges.
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Select a node to edit its properties.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
