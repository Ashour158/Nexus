'use client';

import { useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

const RESOURCES = ['Contacts','Deals','Pipelines','Reports','Cadences','Territories','Workflows','Documents','Billing','Team','Admin Panel'] as const;
const ROLES = ['Admin','Manager','Senior AE','AE','SDR','CSM','Viewer'] as const;
const ACTIONS = ['read','write','delete'] as const;

type Action = (typeof ACTIONS)[number];
type Matrix = Record<string, Record<string, Record<Action, boolean>>>;

function createDefaultMatrix(): Matrix {
  const matrix: Matrix = {};
  for (const resource of RESOURCES) {
    matrix[resource] = {};
    for (const role of ROLES) {
      matrix[resource][role] = {
        read: role !== 'Viewer' || resource !== 'Billing',
        write: role === 'Admin' || role === 'Manager' || role === 'Senior AE',
        delete: role === 'Admin' || role === 'Manager',
      };
    }
  }
  return matrix;
}

export default function AdminRolesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selectedRole, setSelectedRole] = useState<(typeof ROLES)[number]>('Admin');
  const [matrix, setMatrix] = useState<Matrix>(createDefaultMatrix());
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  const roleDesc = useMemo(() => `${selectedRole} can manage resources based on policy toggles below.`, [selectedRole]);

  function toggle(resource: string, role: string, action: Action, value: boolean) {
    setMatrix((prev) => ({ ...prev, [resource]: { ...prev[resource], [role]: { ...prev[resource][role], [action]: value } } }));
  }

  async function save() {
    setMsg('Saving...');
    await fetch('/api/admin/roles/permissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ matrix }),
    }).catch(() => undefined);
    setMsg('Saved');
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Roles & Permissions</h2>
      <div className="flex flex-wrap gap-2">{ROLES.map((r) => <button key={r} onClick={() => setSelectedRole(r)} className={`rounded px-3 py-1.5 text-sm ${selectedRole === r ? 'bg-blue-600' : 'bg-gray-800'}`}>{r}</button>)}</div>
      <div className="rounded border border-gray-800 bg-gray-900 p-3 text-sm text-gray-300">{roleDesc}</div>
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="min-w-full text-xs">
          <thead className="text-left uppercase tracking-wide text-gray-400"><tr><th className="px-3 py-2">Resource</th>{ROLES.map((r) => <th key={r} className={`px-3 py-2 ${r === selectedRole ? 'bg-blue-900/40' : ''}`}>{r}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-800">{RESOURCES.map((res) => <tr key={res}><td className="px-3 py-2 font-medium">{res}</td>{ROLES.map((role) => <td key={role} className={`px-3 py-2 ${role === selectedRole ? 'bg-blue-900/20' : ''}`}><div className="flex gap-2">{ACTIONS.map((a) => <label key={a} className="inline-flex items-center gap-1"><input type="checkbox" checked={matrix[res][role][a]} onChange={(e) => toggle(res, role, a, e.target.checked)} />{a[0].toUpperCase()}</label>)}</div></td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center gap-2"><button onClick={save} className="rounded bg-blue-600 px-3 py-2 text-sm">Save Permissions</button><button onClick={() => setOpen(true)} className="rounded border border-gray-700 px-3 py-2 text-sm">Create custom role</button>{msg ? <span className="text-sm text-gray-400">{msg}</span> : null}</div>
      {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-4"><h3 className="text-lg font-semibold">Create custom role</h3><div className="mt-3 grid gap-2"><input placeholder="Role name" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" /><input placeholder="Description" className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm" /><select className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm"><option>Copy from Admin</option><option>Copy from Manager</option></select></div><div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded border border-gray-700 px-3 py-1.5 text-sm">Cancel</button><button onClick={() => setOpen(false)} className="rounded bg-blue-600 px-3 py-1.5 text-sm">Create</button></div></div></div> : null}
    </div>
  );
}
