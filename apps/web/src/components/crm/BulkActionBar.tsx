'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import { ChevronDown, Tag, Trash2, UserCheck, X } from 'lucide-react';

type EntityType = 'contact' | 'deal' | 'lead' | 'account';

interface BulkActionBarProps {
  entityType: EntityType;
  selectedIds: string[];
  onClear: () => void;
  queryKey: unknown[];
}

export function BulkActionBar({ entityType, selectedIds, onClear, queryKey }: BulkActionBarProps) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();
  const [showReassign, setShowReassign] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  const count = selectedIds.length;

  const bulkUpdate = useMutation({
    mutationFn: (updates: Record<string, unknown>) => fetch('/api/crm/bulk/update', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, ids: selectedIds, updates }) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        notify.success(`Updated ${res.data.updated} records`);
        qc.invalidateQueries({ queryKey });
        onClear();
      } else notify.error('Bulk update failed');
    },
  });

  const bulkDelete = useMutation({
    mutationFn: () => fetch('/api/crm/bulk/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, ids: selectedIds, hard: false }) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        notify.success(`Removed ${res.data.deleted} records`);
        qc.invalidateQueries({ queryKey });
        onClear();
      }
    },
  });

  const bulkTag = useMutation({
    mutationFn: (addTags: string[]) => fetch('/api/crm/bulk/tag', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType, ids: selectedIds, addTags }) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        notify.success(`Tagged ${res.data.processed} records`);
        qc.invalidateQueries({ queryKey });
        setTagInput('');
        setShowTagInput(false);
        onClear();
      }
    },
  });

  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 start-1/2 z-40 flex min-w-[400px] -translate-x-1/2 items-center gap-4 rounded-2xl bg-gray-900 px-5 py-3 text-white shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">{count}</span>
        <span className="text-sm text-gray-300">selected</span>
        <button onClick={onClear} className="ms-1 text-gray-500 hover:text-gray-300"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="h-6 w-px bg-gray-700" />
      <div className="relative">
        <button onClick={() => { setShowTagInput((s) => !s); setShowReassign(false); }} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white"><Tag className="h-4 w-4" /> Tag</button>
        {showTagInput && <div className="absolute bottom-full mb-2 start-0 min-w-[220px] rounded-xl bg-white p-3 shadow-xl"><input autoFocus value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tagInput.trim() && bulkTag.mutate(tagInput.split(',').map((t) => t.trim()).filter(Boolean))} placeholder="Enter tags" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" /></div>}
      </div>
      {(entityType === 'contact' || entityType === 'deal' || entityType === 'lead') && <div className="relative"><button onClick={() => { setShowReassign((s) => !s); setShowTagInput(false); }} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white"><UserCheck className="h-4 w-4" /> Reassign <ChevronDown className="h-3.5 w-3.5" /></button>{showReassign && <div className="absolute bottom-full mb-2 start-0 min-w-[240px] rounded-xl bg-white p-3 shadow-xl"><input value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} placeholder="User ID or email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" /><button onClick={() => { if (reassignTo) { bulkUpdate.mutate({ ownerId: reassignTo }); setShowReassign(false); } }} className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-sm text-white">Apply</button></div>}</div>}
      <button onClick={async () => { if (await confirm(`Remove ${count} ${entityType}(s)? This can be undone by an admin.`, 'Remove Records')) bulkDelete.mutate(); }} className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300"><Trash2 className="h-4 w-4" /> Remove</button>
      {ConfirmDialog}
    </div>
  );
}
