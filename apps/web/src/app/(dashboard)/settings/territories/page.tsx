'use client';

import { useEffect, useState } from 'react';
import { Globe2, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface Territory {
  id: string;
  name: string;
  type: string;
  priority: number;
  isDefault: boolean;
  parentId?: string | null;
}
interface TreeNode extends Territory {
  children?: TreeNode[];
}

const TYPES = ['GEOGRAPHIC', 'INDUSTRY', 'ACCOUNT_SIZE', 'CUSTOM'];

function TreeList({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1'}>
      {nodes.map((n) => (
        <li key={n.id}>
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-on-surface"
            style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
          >
            <span className="font-medium">{n.name}</span>
            <Pill tone="neutral">{n.type}</Pill>
            {n.isDefault ? <Pill tone="success">Default</Pill> : null}
          </div>
          {n.children && n.children.length > 0 ? <TreeList nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default function TerritoriesPage() {
  const { get, post, del } = useBff();
  const { rows, state, reload } = useBffList<Territory>('/bff/territory/territories');

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('GEOGRAPHIC');
  const [priority, setPriority] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadTree = async () => {
    const res = await get<TreeNode[]>('/bff/territory/territories/tree');
    setTree(Array.isArray(res.data) ? res.data : []);
  };
  useEffect(() => {
    void loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a territory name');
    setSaving(true);
    const res = await post('/bff/territory/territories', {
      name: name.trim(),
      type,
      priority: Number(priority) || 0,
      ownerIds: [],
      rules: [],
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create territory', res.error);
    notify.success('Territory created');
    setName('');
    void reload();
    void loadTree();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/territory/territories/${id}`);
    if (!res.ok) return notify.error('Failed to delete territory', res.error);
    notify.success('Territory deleted');
    void reload();
    void loadTree();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Globe2}
        title="Territories"
        description="Segment accounts and route records by geography, industry, size, or custom rules. Territories can nest to form a roll-up hierarchy."
        onRefresh={() => {
          void reload();
          void loadTree();
        }}
      />

      <SetupPanel title="New territory">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SetupInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EMEA" />
          <SetupSelect label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </SetupSelect>
          <SetupInput
            label="Priority"
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number.parseInt(e.target.value, 10) || 0)}
            hint="Higher priority wins when a record matches multiple territories."
          />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add territory'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SetupTableCard
          state={state}
          isEmpty={rows.length === 0}
          emptyIcon={Globe2}
          emptyTitle="No territories yet"
          emptyHint="Create a territory to segment and route your accounts."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Territory</th>
                <th className="px-5 py-3 text-start font-medium">Type</th>
                <th className="px-5 py-3 text-end font-medium">Priority</th>
                <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                  <td className="px-5 py-3 font-medium text-on-surface">{t.name}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{t.type.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-end text-on-surface-variant">{t.priority}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => remove(t.id)}
                      className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SetupTableCard>

        <div className="rounded-xl border border-outline-variant bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">Hierarchy</h3>
          {tree.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No hierarchy to show yet.</p>
          ) : (
            <TreeList nodes={tree} />
          )}
        </div>
      </div>
    </div>
  );
}
