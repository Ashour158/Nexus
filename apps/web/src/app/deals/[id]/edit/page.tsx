'use client';

import { useParams, useRouter } from 'next/navigation';
import type { Deal } from '@nexus/shared-types';
import { DealForm } from '@/components/deals/deal-form';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeal } from '@/hooks/use-deals';
import type { CreateDealInput } from '@nexus/validation';

/**
 * Edit Deal page. Loads the deal by id, pivots the server shape into the
 * form's `CreateDealInput` structure, then renders `<DealForm mode="edit" />`.
 */
export default function EditDealPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const dealId = params?.id ?? '';
  const dealQuery = useDeal(dealId);

  if (!dealId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-red-600">Missing deal id in the URL.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit deal</h1>
        <p className="text-sm text-slate-600">
          Update the details and click save to apply changes.
        </p>
      </header>

      {dealQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-32" />
        </div>
      ) : dealQuery.isError || !dealQuery.data ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          Deal not found or you do not have access to it.
        </p>
      ) : (
        <DealForm
          mode="edit"
          dealId={dealId}
          initialValues={toFormValues(dealQuery.data)}
          onSuccess={() => router.push('/deals')}
          onCancel={() => router.push('/deals')}
        />
      )}
    </main>
  );
}

function toFormValues(deal: Deal): Partial<CreateDealInput> {
  return {
    name: deal.name,
    accountId: deal.accountId,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    ownerId: deal.ownerId,
    amount: Number(deal.amount ?? 0),
    currency: deal.currency,
    expectedCloseDate: deal.expectedCloseDate
      ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10)
      : undefined,
    contactIds: extractContactIds(deal),
    tags: deal.tags ?? [],
    customFields:
      (deal.customFields as Record<string, unknown> | undefined) ?? {},
  };
}

/**
 * The deal detail endpoint (Section 34.2) returns `contacts: DealContact[]`
 * alongside the base Deal shape, but the core `Deal` type in
 * `@nexus/shared-types` intentionally stays minimal. Read the contact ids
 * defensively so we don't widen the shared type just for form prefill.
 */
function extractContactIds(deal: Deal): string[] {
  const raw = (deal as unknown as { contacts?: unknown }).contacts;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && 'contactId' in entry) {
      const cid = (entry as { contactId?: unknown }).contactId;
      if (typeof cid === 'string') ids.push(cid);
    }
  }
  return ids;
}
