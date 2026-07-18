'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUsers } from '@/hooks/use-users';
import { useTestAssignment } from '@/hooks/use-territories';

type Attr = { key: string; field: string; value: string };

let attrSeq = 0;
function newAttr(field = '', value = ''): Attr {
  attrSeq += 1;
  return { key: `a${attrSeq}`, field, value };
}

/**
 * Dry-run: POST a sample record to /test-assignment and show which territory +
 * owner it would route to, without writing a routing-log or emitting events.
 * Great for admins validating rule configuration before it goes live.
 */
export function TestAssignmentPanel() {
  const [attrs, setAttrs] = useState<Attr[]>([newAttr('country', ''), newAttr('industry', '')]);
  const test = useTestAssignment();
  const { data: users } = useUsers({ limit: 100 });

  const ownerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users?.data ?? []) {
      map.set(u.id, `${u.firstName} ${u.lastName}`.trim() || u.email);
    }
    return (id?: string | null) => (id ? map.get(id) ?? id : '—');
  }, [users]);

  const update = (key: string, patch: Partial<Attr>) =>
    setAttrs((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const run = () => {
    const record: Record<string, unknown> = {};
    for (const a of attrs) {
      if (a.field.trim()) record[a.field.trim()] = a.value;
    }
    test.mutate(record);
  };

  const result = test.data;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="font-semibold text-on-surface">Test Assignment (dry-run)</h3>
      <p className="mb-4 mt-1 text-sm text-on-surface-variant">
        Enter a sample record&apos;s attributes and see which territory + owner it would route to.
      </p>

      <div className="space-y-2">
        {attrs.map((a) => (
          <div key={a.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              value={a.field}
              onChange={(e) => update(a.key, { field: e.target.value })}
              placeholder="field (e.g. country)"
            />
            <Input
              value={a.value}
              onChange={(e) => update(a.key, { value: e.target.value })}
              placeholder="value (e.g. SA)"
            />
            <button
              type="button"
              onClick={() => setAttrs((p) => p.filter((x) => x.key !== a.key))}
              className="rounded-lg px-2 py-1 text-error hover:bg-error-container hover:text-error"
              aria-label="Remove attribute"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAttrs((p) => [...p, newAttr()])}>
          + Add attribute
        </Button>
        <Button size="sm" onClick={run} isLoading={test.isPending}>
          Run test
        </Button>
      </div>

      {test.isError ? (
        <p className="mt-4 text-sm text-error">
          Test failed. The territory service may be unavailable.
        </p>
      ) : null}

      {test.isSuccess ? (
        result ? (
          <div className="mt-4 rounded-lg border border-success/30 bg-success-container p-4 text-sm">
            <p className="font-medium text-on-success-container">
              Would route to: {result.territory.name}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-on-success-container/80">
              <dt className="text-success">Type</dt>
              <dd>{result.territory.type}</dd>
              <dt className="text-success">Owner</dt>
              <dd>{ownerName(result.assignedOwnerId)}</dd>
              <dt className="text-success">Matched rules</dt>
              <dd>{result.matchedRuleIds.length}</dd>
              <dt className="text-success">Via default</dt>
              <dd>{result.viaDefault ? 'Yes' : 'No'}</dd>
            </dl>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
            No territory matched this record (and no default territory is configured).
          </div>
        )
      ) : null}
    </div>
  );
}
