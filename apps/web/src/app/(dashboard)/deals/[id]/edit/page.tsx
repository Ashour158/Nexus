'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDeal, useUpdateDeal } from '@/hooks/use-deals';
import { usePipelines, useStages } from '@/hooks/use-pipelines';
import { useUsers } from '@/hooks/use-users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';


export default function DealEditPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canUpdate = hasPermission('deals:update');
  const dealQuery = useDeal(dealId);
  const pipelinesQuery = usePipelines();
  const usersQuery = useUsers({ limit: 200 });
  const updateDeal = useUpdateDeal();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [probability, setProbability] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [stageId, setStageId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [forecastCategory, setForecastCategory] = useState('PIPELINE');

  const deal = dealQuery.data;
  const pipelines = pipelinesQuery.data ?? [];
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stagesQuery = useStages(selectedPipeline?.id ?? null);
  const stages = stagesQuery.data ?? [];
  const owners = usersQuery.data?.data ?? [];

  useEffect(() => {
    if (deal) {
      setName(deal.name);
      setAmount(String(deal.amount ?? ''));
      setCurrency(deal.currency ?? 'USD');
      setProbability(String(deal.probability ?? ''));
      setExpectedCloseDate(deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : '');
      setStatus(deal.status);
      setStageId(deal.stageId);
      setOwnerId(deal.ownerId);
      setPipelineId(deal.pipelineId);
      setForecastCategory(deal.forecastCategory);
    }
  }, [deal]);

  if (!canUpdate) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-warning/30 bg-warning-container p-6 text-sm text-on-warning-container">
          You do not have permission to edit deals.
        </div>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deal) return;
    updateDeal.mutate(
      {
        id: dealId,
        data: {
          name: name.trim(),
          amount: amount ? Number(amount) : undefined,
          currency: currency.trim() || undefined,
          probability: probability ? Number(probability) : undefined,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate).toISOString() : undefined,
          status: status as 'OPEN' | 'WON' | 'LOST' | 'DORMANT',
          stageId: stageId || undefined,
          ownerId: ownerId || undefined,
          pipelineId: pipelineId || undefined,
          forecastCategory: forecastCategory as 'PIPELINE' | 'BEST_CASE' | 'COMMIT' | 'CLOSED' | 'OMITTED',
        },
      },
      {
        onSuccess: () => {
          router.push(`/deals/${dealId}`);
        },
      }
    );
  }

  if (dealQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-96" />
      </div>
    );
  }

  if (dealQuery.isError || !deal) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-error/30 bg-error-container p-6 text-sm text-error">
          Failed to load deal.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Edit Deal</h1>
        <Button variant="secondary" onClick={() => router.push(`/deals/${dealId}`)}>
          Cancel
        </Button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-outline-variant bg-surface p-6">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Amount</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Currency</label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1" maxLength={3} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Probability (%)</label>
            <Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Expected Close Date</label>
            <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-2 text-sm"
            >
              <option value="OPEN">Open</option>
              <option value="WON">Won</option>
              <option value="LOST">Lost</option>
              <option value="DORMANT">Dormant</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Forecast Category</label>
            <select
              value={forecastCategory}
              onChange={(e) => setForecastCategory(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-2 text-sm"
            >
              <option value="PIPELINE">Pipeline</option>
              <option value="BEST_CASE">Best Case</option>
              <option value="COMMIT">Commit</option>
              <option value="CLOSED">Closed</option>
              <option value="OMITTED">Omitted</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Pipeline</label>
            <select
              value={pipelineId}
              onChange={(e) => {
                const nextPipelineId = e.target.value;
                setPipelineId(nextPipelineId);
                // The current stage belongs to the old pipeline; clear it so a
                // stale stageId can't be submitted against the new pipeline.
                setStageId('');
              }}
              className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-2 text-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant">Stage</label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-2 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-on-surface-variant">Owner</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-outline-variant bg-surface px-2 text-sm"
          >
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="submit"
            isLoading={updateDeal.isPending}
            disabled={updateDeal.isPending}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
