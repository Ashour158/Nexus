'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface Props {
  onCreated: (contact: { id: string; name: string; email: string }) => void;
  onCancel: () => void;
}

export function QuickCreateContact({ onCreated, onCancel }: Props) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, company }),
      });
      if (!res.ok) throw new Error('Failed to create contact');
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onCreated({ id: data.id, name: `${firstName} ${lastName}`.trim(), email });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open onClose={onCancel} title="Quick-create contact" size="md">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
        <div className="mb-1 flex items-center gap-2 text-sm text-blue-700">
          <UserPlus className="h-4 w-4" />
          Add a contact without leaving deal creation
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">First name *</label>
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Email *</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Company</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={create.isPending} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50">
            {create.isPending ? 'Creating...' : 'Create & add to deal'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
