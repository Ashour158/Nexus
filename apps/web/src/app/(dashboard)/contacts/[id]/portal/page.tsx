'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useContact } from '@/hooks/use-contacts';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';

export default function ContactPortalPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('contacts:read');
  const contactQuery = useContact(contactId);
  const [portalEnabled, setPortalEnabled] = useState(false);

  const contact = contactQuery.data;

  if (!canRead) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view contacts.
        </div>
      </div>
    );
  }

  if (contactQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  if (contactQuery.isError || !contact) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load contact.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Portal Access
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {contact.firstName} {contact.lastName} · {contact.email ?? 'No email'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.push(`/contacts/${contactId}`)}>
          ← Back
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Customer Portal</h2>
            <p className="mt-1 text-xs text-slate-500">
              Enable portal access to let this contact view deals, invoices, and support tickets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPortalEnabled((v) => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              portalEnabled ? 'bg-slate-900' : 'bg-slate-200'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                portalEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-sm text-slate-700">View Deals</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-slate-900' : 'text-slate-400')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-sm text-slate-700">View Invoices</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-slate-900' : 'text-slate-400')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-sm text-slate-700">Submit Support Tickets</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-slate-900' : 'text-slate-400')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
