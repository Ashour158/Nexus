'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useCadence } from '@/hooks/use-cadences';
import { useContacts } from '@/hooks/use-contacts';
import { useLeads } from '@/hooks/use-leads';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

export default function EnrollPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canUpdate = hasPermission('workflows:update');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [entityType, setEntityType] = useState<'CONTACT' | 'LEAD'>('CONTACT');
  const [search, setSearch] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);

  const cadenceQuery = useCadence(id);
  const contactsQuery = useContacts({ search: search || undefined, limit: 50 });
  const leadsQuery = useLeads({ search: search || undefined, limit: 50 });

  if (!canUpdate) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to enroll contacts in cadences.
        </div>
      </main>
    );
  }

  const cadence = cadenceQuery.data;
  const items = entityType === 'CONTACT'
    ? (contactsQuery.data?.data ?? [])
    : (leadsQuery.data?.data ?? []);

  const toggle = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  async function handleEnroll() {
    if (selectedIds.size === 0) {
      notify.error('Select at least one contact or lead');
      return;
    }
    setEnrolling(true);
    let success = 0;
    let failed = 0;
    for (const contactId of selectedIds) {
      try {
        await apiClients.workflow.post(`/journeys/${id}/enroll`, { contactId });
        success++;
      } catch {
        failed++;
      }
    }
    setEnrolling(false);
    setEnrolledCount(success);
    if (success > 0) {
      notify.success(`Enrolled ${success} ${entityType.toLowerCase()}s`);
    }
    if (failed > 0) {
      notify.error(`Failed to enroll ${failed} ${entityType.toLowerCase()}s`);
    }
  }

  if (cadenceQuery.isLoading) {
    return (
      <main className="p-6">
        <TableSkeleton rows={4} cols={3} />
      </main>
    );
  }

  if (!cadence) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Cadence not found.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <div className="text-sm text-slate-500">
          <Link href={`/cadences/${id}`} className="hover:text-slate-800">
            {cadence.name}
          </Link>
          <span> / </span>
          <span>Enroll</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Enroll in {cadence.name}
        </h1>
        <p className="text-sm text-slate-600">
          Select {entityType.toLowerCase()}s to add to this cadence.
        </p>
      </header>

      {enrolledCount !== null && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Enrollment complete</p>
          <p>{enrolledCount} {entityType.toLowerCase()}s enrolled successfully.</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={() => router.push(`/cadences/${id}`)}
          >
            Back to cadence
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          {(['CONTACT', 'LEAD'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setEntityType(t);
                setSelectedIds(new Set());
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                entityType === t
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}s
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${entityType.toLowerCase()}s...`}
          className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
        />
        <div className="ms-auto text-sm text-slate-500">
          {selectedIds.size} selected
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {entityType === 'CONTACT' && contactsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : entityType === 'LEAD' && leadsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No {entityType.toLowerCase()}s found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length && items.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(items.map((i) => i.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const record = item as { id: string; firstName?: string | null; lastName?: string | null; email?: string | null; accountId?: string | null; company?: string | null };
                const name = `${record.firstName ?? ''} ${record.lastName ?? ''}`;
                const email = record.email ?? '—';
                const company =
                  entityType === 'CONTACT'
                    ? record.accountId ?? '—'
                    : record.company ?? '—';
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{name.trim() || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{email}</td>
                    <td className="px-4 py-3 text-slate-600">{company}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex gap-3">
        <Button
          type="button"
          onClick={handleEnroll}
          disabled={enrolling || selectedIds.size === 0}
        >
          {enrolling ? 'Enrolling…' : `Enroll ${selectedIds.size} ${entityType.toLowerCase()}s`}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </main>
  );
}
