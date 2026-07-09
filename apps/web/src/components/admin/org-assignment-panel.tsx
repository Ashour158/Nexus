'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useUsers } from '@/hooks/use-users';
import {
  useDepartments,
  useLevels,
  useAssignUserOrg,
  type Department,
  type UserOrgAssignment,
} from '@/hooks/use-org';

const inputClass =
  'mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-2 text-sm text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60';

/**
 * Org assignment (manager / department / level / job title) for a single user.
 * PATCHes `/users/:id/org` on auth-service. Styled for the dark admin shell.
 *
 * `initial` seeds the current assignment when the caller already has it; the
 * fields are otherwise editable from empty. Gated on `users:update`.
 */
export function OrgAssignmentPanel({
  userId,
  initial,
}: {
  userId: string;
  initial?: UserOrgAssignment;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission('users:update');

  const usersQuery = useUsers({ limit: 200 });
  const { data: departments } = useDepartments(false);
  const { data: levels } = useLevels();
  const assign = useAssignUserOrg();

  const [managerId, setManagerId] = useState(initial?.managerId ?? '');
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? '');
  const [levelId, setLevelId] = useState(initial?.levelId ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? '');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (initial) {
      setManagerId(initial.managerId ?? '');
      setDepartmentId(initial.departmentId ?? '');
      setLevelId(initial.levelId ?? '');
      setJobTitle(initial.jobTitle ?? '');
    }
  }, [initial]);

  const users = (usersQuery.data?.data ?? []).filter((u) => u.id !== userId);
  const depts = (departments ?? []) as Department[];
  const lvls = levels ?? [];

  async function save() {
    setBanner(null);
    const payload: UserOrgAssignment = {
      managerId: managerId || null,
      departmentId: departmentId || null,
      levelId: levelId || null,
      jobTitle: jobTitle.trim() || null,
    };
    try {
      await assign.mutateAsync({ id: userId, data: payload });
      setBanner({ kind: 'ok', text: 'Org assignment saved.' });
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">Organization</h3>
      {banner ? (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              : 'border-red-800 bg-red-950/40 text-red-300'
          }`}
        >
          {banner.text}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-gray-300">
          Manager
          <select
            className={inputClass}
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">— None —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-300">
          Department
          <select
            className={inputClass}
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">— Unassigned —</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-300">
          Level
          <select
            className={inputClass}
            value={levelId}
            onChange={(e) => setLevelId(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">— Unassigned —</option>
            {lvls.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-300">
          Job title
          <input
            className={inputClass}
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            disabled={!canEdit}
            placeholder="e.g. Account Executive"
          />
        </label>
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={save} isLoading={assign.isPending} className="bg-blue-600 hover:bg-blue-500">
            Save org assignment
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Editing requires the users:update permission.</p>
      )}
    </section>
  );
}
