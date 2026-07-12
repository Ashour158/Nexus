'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

/**
 * AI Models settings — lists the trained explainable-AI models and exposes an
 * admin "Retrain" control. Retrain is honest: when there isn't enough labelled
 * data the backend keeps its priors and returns a reason, which we surface
 * verbatim rather than pretending a model was produced.
 */

interface AiModel {
  id: string;
  kind: string;
  version: string;
  trainedAt?: string;
  sampleSize?: number;
  metrics?: Record<string, number>;
  active?: boolean;
}

interface RetrainResult {
  kind: string;
  retrained: boolean;
  keptPriors?: boolean;
  reason?: string;
  sampleSize?: number;
  minSampleSize?: number;
  metrics?: Record<string, number>;
}

const RETRAIN_KINDS = ['deal-win', 'lead-convert'];

export default function AiModelsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [models, setModels] = useState<AiModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RetrainResult | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> =>
      accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    [accessToken]
  );

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/models', { headers: authHeaders() });
      if (!res.ok) throw new Error(`Model list request failed (${res.status})`);
      const body = await res.json();
      setModels(Array.isArray(body.data) ? body.data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load AI models');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const retrain = async (kind: string) => {
    setRetraining(kind);
    setLastResult(null);
    try {
      const res = await fetch('/api/ai/models/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ kind }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `Retrain failed (${res.status})`);
      }
      const result = (body.data ?? body) as RetrainResult;
      setLastResult(result);
      if (result.retrained) {
        notify.success(`Retrained ${kind} model`);
      } else {
        notify.success(`${kind}: ${result.reason ?? 'kept existing priors'}`);
      }
      void fetchModels();
    } catch (err) {
      notify.error('Retrain failed', err instanceof Error ? err.message : undefined);
    } finally {
      setRetraining(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-on-surface">AI Models</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Explainable prediction models for deal win and lead conversion. Retraining
          is honest — if there isn&apos;t enough labelled history yet, the model keeps
          its priors and tells you why.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-container px-4 py-3 text-sm text-on-warning-container">
          {error}
        </div>
      ) : null}

      {lastResult ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            lastResult.retrained
              ? 'border-success/30 bg-success-container text-on-success-container'
              : 'border-warning/30 bg-warning-container text-on-warning-container'
          }`}
        >
          <p className="font-semibold">
            {lastResult.retrained
              ? `Retrained the ${lastResult.kind} model.`
              : `Kept priors for the ${lastResult.kind} model.`}
          </p>
          {lastResult.reason ? <p className="mt-0.5">{lastResult.reason}</p> : null}
          {typeof lastResult.sampleSize === 'number' ? (
            <p className="mt-0.5 text-xs">
              Labelled samples: {lastResult.sampleSize}
              {typeof lastResult.minSampleSize === 'number'
                ? ` / ${lastResult.minSampleSize} required`
                : ''}
            </p>
          ) : null}
          {lastResult.metrics ? (
            <p className="mt-0.5 text-xs">
              {Object.entries(lastResult.metrics)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {RETRAIN_KINDS.map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            disabled={retraining !== null}
            onClick={() => void retrain(kind)}
          >
            {retraining === kind ? `Retraining ${kind}…` : `Retrain ${kind}`}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-outline-variant bg-surface-container-low">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Model</th>
              <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Version</th>
              <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Samples</th>
              <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Metrics</th>
              <th className="px-4 py-3 text-center font-medium text-on-surface-variant">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  Loading models…
                </td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                  No models trained yet.
                </td>
              </tr>
            ) : (
              models.map((model) => (
                <tr key={model.id} className={model.active === false ? 'opacity-50' : undefined}>
                  <td className="px-4 py-3 font-medium capitalize text-on-surface">
                    {model.kind.replace(/-/g, ' ')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{model.version}</td>
                  <td className="px-4 py-3 text-end text-on-surface">{model.sampleSize ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {model.metrics
                      ? Object.entries(model.metrics)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        model.active === false
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-success-container text-success'
                      }`}
                    >
                      {model.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
