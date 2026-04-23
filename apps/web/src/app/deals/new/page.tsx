'use client';

import { useRouter } from 'next/navigation';
import type { Deal } from '@nexus/shared-types';
import { DealForm } from '@/components/deals/deal-form';

export default function NewDealPage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New deal</h1>
        <p className="text-sm text-slate-600">
          Fill in the required fields and choose a pipeline stage.
        </p>
      </header>

      <DealForm
        mode="create"
        onSuccess={(deal: Deal) => router.push(`/deals/${deal.id}/edit`)}
        onCancel={() => router.push('/deals')}
      />
    </main>
  );
}
