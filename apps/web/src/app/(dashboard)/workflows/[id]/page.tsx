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
  TRIGGER: 'bg-success-container text-success border-success/40',
  CONDITION: 'bg-warning-container text-warning border-warning/40',
  WAIT: 'bg-surface-container-high text-on-surface border-outline-variant',
  ACTION: 'bg-primary-container text-primary border-primary/40',
  EMAIL: 'bg-tertiary-container text-tertiary border-tertiary/40',
  WEBHOOK: 'bg-info-container text-info border-info/40',
  SET_FIELD: 'bg-tertiary-container text-tertiary border-tertiary/40',
  CREATE_ACTIVITY: 'bg-primary-container text-primary border-primary/40',
  CREATE_TASK: 'bg-success-container text-success border-success/40',
  ASSIGN: 'bg-warning-container text-warning border-warning/40',
  NOTIFY: 'bg-error-container text-error border-error/40',
  FORK: 'bg-success-container text-success border-success/40',
  JOIN: 'bg-tertiary-container text-tertiary border-tertiary/40',
  END: 'bg-error-container text-error border-error/40',
  APPROVAL_REQUEST: 'bg-warning-container text-warning border-warning/40',
  VALIDATION_RULE: 'bg-info-container text-info border-info/40',
  SLA_CHECK: 'bg-tertiary-container text-tertiary border-tertiary/40',
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface px-4 py-3">
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
        <aside className="w-48 overflow-y-auto border-r border-outline-variant bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">Nodes</p>
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
        <div className="relative flex-1 overflow-auto bg-surface-container-low">
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
                } ${selectedNodeId === node.id ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                style={{ left: pos.x, top: pos.y }}
              >
                <div className="flex items-center justify-between">
                  <span>{node.type}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    className="text-on-surface-variant hover:text-error"
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
        <aside className="w-64 overflow-y-auto border-l border-outline-variant bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">Properties</p>
          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-on-surface-variant">Type</label>
                <p className="text-sm font-medium">{selectedNode.type}</p>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant">ID</label>
                <p className="font-mono text-[10px] text-on-surface-variant">{selectedNode.id}</p>
              </div>
              {selectedNode.type === 'TRIGGER' && (
                <div>
                  <label className="text-xs text-on-surface-variant">Trigger event</label>
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
                    <label className="text-xs text-on-surface-variant">Field</label>
                    <Input
                      value={String(selectedNode.config?.field ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'field', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. amount"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Operator</label>
                    <select
                      value={String(selectedNode.config?.operator ?? 'eq')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'operator', e.target.value)}
                      className="mt-1 w-full rounded-md border border-outline-variant px-2 py-1 text-xs"
                    >
                      {['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'].map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Value</label>
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
                  <label className="text-xs text-on-surface-variant">URL</label>
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
                    <label className="text-xs text-on-surface-variant">Subject</label>
                    <Input
                      value={String(selectedNode.config?.subject ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'subject', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Body</label>
                    <textarea
                      value={String(selectedNode.config?.body ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'body', e.target.value)}
                      className="mt-1 w-full rounded-md border border-outline-variant px-2 py-1 text-xs"
                      rows={3}
                    />
                  </div>
                </>
              )}
              {selectedNode.type === 'WAIT' && (
                <div>
                  <label className="text-xs text-on-surface-variant">Delay (days)</label>
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
                    <label className="text-xs text-on-surface-variant">Field</label>
                    <Input
                      value={String(selectedNode.config?.field ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'field', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Value</label>
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
                    <label className="text-xs text-on-surface-variant">Policy ID</label>
                    <Input
                      value={String(selectedNode.config?.policyId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'policyId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="optional — else matched by entity type"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Entity type</label>
                    <Input
                      value={String(selectedNode.config?.entityType ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityType', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. quote, deal, contract"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Entity ID</label>
                    <Input
                      value={String(selectedNode.config?.entityId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="record to request approval for"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Requester ID</label>
                    <Input
                      value={String(selectedNode.config?.requesterId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'requesterId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="who is requesting"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Notes</label>
                    <textarea
                      value={String(selectedNode.config?.notes ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'notes', e.target.value)}
                      className="mt-1 w-full rounded-md border border-outline-variant px-2 py-1 text-xs"
                      rows={2}
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant">
                    Routes on <span className="font-medium text-success">approved</span> /{' '}
                    <span className="font-medium text-error">rejected</span> branch edges.
                  </p>
                </>
              )}
              {selectedNode.type === 'VALIDATION_RULE' && (
                <>
                  <div>
                    <label className="text-xs text-on-surface-variant">Pipeline ID</label>
                    <Input
                      value={String(selectedNode.config?.pipelineId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'pipelineId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">From stage ID</label>
                    <Input
                      value={String(selectedNode.config?.fromStageId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'fromStageId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">To stage ID</label>
                    <Input
                      value={String(selectedNode.config?.toStageId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'toStageId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Deal ID</label>
                    <Input
                      value={String(selectedNode.config?.dealId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'dealId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant">
                    Routes on <span className="font-medium text-success">valid</span> /{' '}
                    <span className="font-medium text-error">invalid</span> branch edges.
                  </p>
                </>
              )}
              {selectedNode.type === 'SLA_CHECK' && (
                <>
                  <div>
                    <label className="text-xs text-on-surface-variant">Entity type</label>
                    <Input
                      value={String(selectedNode.config?.entityType ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityType', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="e.g. deal, lead"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Entity ID</label>
                    <Input
                      value={String(selectedNode.config?.entityId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'entityId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="record to check"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">SLA ID</label>
                    <Input
                      value={String(selectedNode.config?.slaId ?? '')}
                      onChange={(e) => updateNodeConfig(selectedNode.id, 'slaId', e.target.value)}
                      className="mt-1 h-8 text-xs"
                      placeholder="optional — specific SLA definition"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant">
                    Routes on <span className="font-medium text-error">breached</span> /{' '}
                    <span className="font-medium text-success">within</span> branch edges.
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">Select a node to edit its properties.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
