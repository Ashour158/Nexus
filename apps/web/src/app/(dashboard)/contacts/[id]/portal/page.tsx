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
        <div className="rounded-lg border border-warning/30 bg-warning-container p-6 text-sm text-on-warning-container">
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
        <div className="rounded-lg border border-error/30 bg-error-container p-6 text-sm text-error">
          Failed to load contact.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Portal Access
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {contact.firstName} {contact.lastName} · {contact.email ?? 'No email'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.push(`/contacts/${contactId}`)}>
          ← Back
        </Button>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Customer Portal</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Enable portal access to let this contact view deals, invoices, and support tickets.
            </p>
            <span className="mt-2 inline-block rounded bg-warning-container px-2 py-0.5 text-[11px] font-medium text-on-warning-container">
              Preview only — not yet saved to the backend
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPortalEnabled((v) => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              portalEnabled ? 'bg-inverse-surface' : 'bg-surface-container-highest'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-surface transition-transform',
                portalEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <span className="text-sm text-on-surface">View Deals</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-on-surface' : 'text-on-surface-variant')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <span className="text-sm text-on-surface">View Invoices</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-on-surface' : 'text-on-surface-variant')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <span className="text-sm text-on-surface">Submit Support Tickets</span>
            <span className={cn('text-xs font-medium', portalEnabled ? 'text-on-surface' : 'text-on-surface-variant')}>
              {portalEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
