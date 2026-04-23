'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { MeddicicDataSchema, type MeddicicDataInput } from '@nexus/validation';
import { useUpdateMeddic } from '@/hooks/use-meddic';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/ui/tag-input';
import { ChevronDownIcon, ChevronRightIcon, CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * MEDDIC / MEDDPICC qualification form — 8 collapsible sections, per Phase 3
 * spec. The shape mirrors `MeddicicDataSchema`; extra form-only state (champion
 * strength, paper-process type, etc.) is folded into the `notes` string so the
 * wire format stays canonical.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type MeddicicData = MeddicicDataInput;

type ScoreSection =
  | 'metrics'
  | 'decisionCriteria'
  | 'decisionProcess'
  | 'paperProcess'
  | 'identifyPain';

interface SectionState {
  metrics: { score: number; notes: string };
  economicBuyer: {
    identified: boolean;
    name: string;
    accessLevel: 'NO_ACCESS' | 'INDIRECT' | 'DIRECT';
    notes: string;
  };
  decisionCriteria: { score: number; notes: string };
  decisionProcess: {
    score: number;
    notes: string;
    nextStep: string;
    expectedDecisionDate: string;
  };
  paperProcess: {
    score: number;
    notes: string;
    procurementType: 'NONE' | 'STANDARD' | 'ENTERPRISE' | 'LEGAL_HEAVY';
    legalReviewRequired: boolean;
  };
  identifyPain: { score: number; notes: string; businessImpact: string };
  champion: {
    identified: boolean;
    contactId: string;
    strength: 1 | 2 | 3 | 4 | 5;
    notes: string;
  };
  competition: {
    identified: boolean;
    competitors: string[];
    differentiators: string;
    notes: string;
  };
}

export interface DealMeddicicFormProps {
  dealId: string;
  /** Pre-fill from `deal.meddicicData` (matches `MeddicicDataSchema`). */
  initialData?: Partial<MeddicicData>;
  /** Optional contacts list for the "Champion" selector. */
  contacts?: Array<{ id: string; firstName: string; lastName: string }>;
  onSave?: () => void;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_STATE: SectionState = {
  metrics: { score: 0, notes: '' },
  economicBuyer: { identified: false, name: '', accessLevel: 'NO_ACCESS', notes: '' },
  decisionCriteria: { score: 0, notes: '' },
  decisionProcess: { score: 0, notes: '', nextStep: '', expectedDecisionDate: '' },
  paperProcess: {
    score: 0,
    notes: '',
    procurementType: 'NONE',
    legalReviewRequired: false,
  },
  identifyPain: { score: 0, notes: '', businessImpact: '' },
  champion: { identified: false, contactId: '', strength: 3, notes: '' },
  competition: { identified: false, competitors: [], differentiators: '', notes: '' },
};

function mergeInitial(initial?: Partial<MeddicicData>): SectionState {
  if (!initial) return DEFAULT_STATE;
  return {
    ...DEFAULT_STATE,
    metrics: { ...DEFAULT_STATE.metrics, ...(initial.metrics ?? {}) },
    economicBuyer: {
      ...DEFAULT_STATE.economicBuyer,
      identified: initial.economicBuyer?.identified ?? false,
      name: initial.economicBuyer?.name ?? '',
      notes: initial.economicBuyer?.notes ?? '',
    },
    decisionCriteria: {
      ...DEFAULT_STATE.decisionCriteria,
      ...(initial.decisionCriteria ?? {}),
    },
    decisionProcess: {
      ...DEFAULT_STATE.decisionProcess,
      score: initial.decisionProcess?.score ?? 0,
      notes: initial.decisionProcess?.notes ?? '',
    },
    paperProcess: {
      ...DEFAULT_STATE.paperProcess,
      score: initial.paperProcess?.score ?? 0,
      notes: initial.paperProcess?.notes ?? '',
    },
    identifyPain: {
      ...DEFAULT_STATE.identifyPain,
      score: initial.identifyPain?.score ?? 0,
      notes: initial.identifyPain?.notes ?? '',
    },
    champion: {
      ...DEFAULT_STATE.champion,
      identified: initial.champion?.identified ?? false,
      notes: initial.champion?.notes ?? '',
    },
    competition: {
      ...DEFAULT_STATE.competition,
      identified: initial.competition?.identified ?? false,
      competitors: initial.competition?.competitors ?? [],
      notes: initial.competition?.notes ?? '',
    },
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DealMeddicicForm({
  dealId,
  initialData,
  contacts = [],
  onSave,
}: DealMeddicicFormProps): JSX.Element {
  const [state, setState] = useState<SectionState>(() => mergeInitial(initialData));
  const [open, setOpen] = useState<Record<string, boolean>>({
    metrics: true,
    economicBuyer: true,
    decisionCriteria: false,
    decisionProcess: false,
    paperProcess: false,
    identifyPain: false,
    champion: false,
    competition: false,
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const updateMeddic = useUpdateMeddic();

  // Derived composite MEDDIC score (average of 6 scored dimensions; binary
  // signals add a 10pt bump each up to 100).
  const totalScore = useMemo(() => {
    const scoreCount = 6;
    const scored =
      state.metrics.score +
      state.decisionCriteria.score +
      state.decisionProcess.score +
      state.paperProcess.score +
      state.identifyPain.score;
    const avg = scored / scoreCount; // out of ~83 if 5 sections max 100
    const championBump = state.champion.identified ? 10 : 0;
    const buyerBump = state.economicBuyer.identified ? 10 : 0;
    return Math.max(0, Math.min(100, Math.round(avg + championBump + buyerBump)));
  }, [state]);

  function toggle(key: string) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  function setScore(section: ScoreSection, score: number) {
    setState((s) => ({ ...s, [section]: { ...s[section], score } }));
  }

  function buildPayload(): MeddicicData {
    const buyerNotes = [
      state.economicBuyer.notes,
      state.economicBuyer.accessLevel !== 'NO_ACCESS'
        ? `Access: ${state.economicBuyer.accessLevel}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const processNotes = [
      state.decisionProcess.notes,
      state.decisionProcess.nextStep ? `Next step: ${state.decisionProcess.nextStep}` : null,
      state.decisionProcess.expectedDecisionDate
        ? `Expected: ${state.decisionProcess.expectedDecisionDate}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const paperNotes = [
      state.paperProcess.notes,
      `Procurement: ${state.paperProcess.procurementType}`,
      state.paperProcess.legalReviewRequired ? 'Legal review required' : null,
    ]
      .filter(Boolean)
      .join('\n');

    const painNotes = [
      state.identifyPain.notes,
      state.identifyPain.businessImpact
        ? `Business impact: ${state.identifyPain.businessImpact}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const champNotes = [
      state.champion.notes,
      state.champion.contactId ? `Contact: ${state.champion.contactId}` : null,
      `Strength: ${state.champion.strength}/5`,
    ]
      .filter(Boolean)
      .join('\n');

    const compNotes = [
      state.competition.notes,
      state.competition.differentiators
        ? `Differentiators: ${state.competition.differentiators}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      metrics: state.metrics,
      economicBuyer: {
        identified: state.economicBuyer.identified,
        name: state.economicBuyer.name || undefined,
        notes: buyerNotes,
      },
      decisionCriteria: state.decisionCriteria,
      decisionProcess: { score: state.decisionProcess.score, notes: processNotes },
      paperProcess: { score: state.paperProcess.score, notes: paperNotes },
      identifyPain: { score: state.identifyPain.score, notes: painNotes },
      champion: {
        identified: state.champion.identified,
        name: state.champion.contactId || undefined,
        notes: champNotes,
      },
      competition: {
        identified: state.competition.identified,
        competitors: state.competition.competitors,
        notes: compNotes,
      },
      totalScore,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload = buildPayload();
    const parsed = MeddicicDataSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? 'Validation failed');
      return;
    }
    try {
      await updateMeddic.mutateAsync({ id: dealId, data: parsed.data });
      onSave?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Section
        label="Metrics"
        description="Quantifiable business value"
        open={open.metrics}
        onToggle={() => toggle('metrics')}
        score={state.metrics.score}
      >
        <ScoreSlider
          value={state.metrics.score}
          onChange={(v) => setScore('metrics', v)}
        />
        <FormField label="Metric details">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={state.metrics.notes}
              onChange={(e) =>
                setState((s) => ({ ...s, metrics: { ...s.metrics, notes: e.target.value } }))
              }
              placeholder="ROI, efficiency gains, revenue impact…"
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Economic Buyer"
        description="Has budget authority"
        open={open.economicBuyer}
        onToggle={() => toggle('economicBuyer')}
        binaryIdentified={state.economicBuyer.identified}
      >
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.economicBuyer.identified}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                economicBuyer: { ...s.economicBuyer, identified: e.target.checked },
              }))
            }
          />
          Identified
        </label>
        <FormField label="Name">
          {({ id }) => (
            <Input
              id={id}
              value={state.economicBuyer.name}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  economicBuyer: { ...s.economicBuyer, name: e.target.value },
                }))
              }
              placeholder="VP Finance, CFO, etc."
            />
          )}
        </FormField>
        <FormField label="Access level">
          {({ id }) => (
            <select
              id={id}
              value={state.economicBuyer.accessLevel}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  economicBuyer: {
                    ...s.economicBuyer,
                    accessLevel: e.target.value as SectionState['economicBuyer']['accessLevel'],
                  },
                }))
              }
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="NO_ACCESS">No access</option>
              <option value="INDIRECT">Indirect (via champion)</option>
              <option value="DIRECT">Direct (we meet regularly)</option>
            </select>
          )}
        </FormField>
        <FormField label="Notes">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={state.economicBuyer.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  economicBuyer: { ...s.economicBuyer, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Decision Criteria"
        description="How the decision will be made"
        open={open.decisionCriteria}
        onToggle={() => toggle('decisionCriteria')}
        score={state.decisionCriteria.score}
      >
        <ScoreSlider
          value={state.decisionCriteria.score}
          onChange={(v) => setScore('decisionCriteria', v)}
        />
        <FormField label="Criteria (one per line)">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={state.decisionCriteria.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  decisionCriteria: { ...s.decisionCriteria, notes: e.target.value },
                }))
              }
              placeholder="e.g. Must integrate with Salesforce\nBudget under $50k…"
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Decision Process"
        description="Stakeholders & steps"
        open={open.decisionProcess}
        onToggle={() => toggle('decisionProcess')}
        score={state.decisionProcess.score}
      >
        <ScoreSlider
          value={state.decisionProcess.score}
          onChange={(v) => setScore('decisionProcess', v)}
        />
        <FormField label="Process description">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={state.decisionProcess.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  decisionProcess: { ...s.decisionProcess, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
        <FormField label="Next step">
          {({ id }) => (
            <Input
              id={id}
              value={state.decisionProcess.nextStep}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  decisionProcess: { ...s.decisionProcess, nextStep: e.target.value },
                }))
              }
            />
          )}
        </FormField>
        <FormField label="Expected decision date">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={state.decisionProcess.expectedDecisionDate}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  decisionProcess: {
                    ...s.decisionProcess,
                    expectedDecisionDate: e.target.value,
                  },
                }))
              }
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Paper Process"
        description="Procurement & legal"
        open={open.paperProcess}
        onToggle={() => toggle('paperProcess')}
        score={state.paperProcess.score}
      >
        <ScoreSlider
          value={state.paperProcess.score}
          onChange={(v) => setScore('paperProcess', v)}
        />
        <FormField label="Procurement type">
          {({ id }) => (
            <select
              id={id}
              value={state.paperProcess.procurementType}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  paperProcess: {
                    ...s.paperProcess,
                    procurementType: e.target.value as SectionState['paperProcess']['procurementType'],
                  },
                }))
              }
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="NONE">None</option>
              <option value="STANDARD">Standard PO</option>
              <option value="ENTERPRISE">Enterprise procurement</option>
              <option value="LEGAL_HEAVY">Legal-heavy (red-line expected)</option>
            </select>
          )}
        </FormField>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.paperProcess.legalReviewRequired}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                paperProcess: {
                  ...s.paperProcess,
                  legalReviewRequired: e.target.checked,
                },
              }))
            }
          />
          Legal review required
        </label>
        <FormField label="Notes">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={state.paperProcess.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  paperProcess: { ...s.paperProcess, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Identify Pain"
        description="Customer's explicit pain"
        open={open.identifyPain}
        onToggle={() => toggle('identifyPain')}
        score={state.identifyPain.score}
      >
        <ScoreSlider
          value={state.identifyPain.score}
          onChange={(v) => setScore('identifyPain', v)}
        />
        <FormField label="Pain description">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={state.identifyPain.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  identifyPain: { ...s.identifyPain, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
        <FormField label="Business impact">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={state.identifyPain.businessImpact}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  identifyPain: {
                    ...s.identifyPain,
                    businessImpact: e.target.value,
                  },
                }))
              }
              placeholder="Quantify: $ lost, hours wasted, risk exposure…"
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Champion"
        description="Internal advocate"
        open={open.champion}
        onToggle={() => toggle('champion')}
        binaryIdentified={state.champion.identified}
      >
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.champion.identified}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                champion: { ...s.champion, identified: e.target.checked },
              }))
            }
          />
          Identified
        </label>
        <FormField label="Contact">
          {({ id }) => (
            <select
              id={id}
              value={state.champion.contactId}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  champion: { ...s.champion, contactId: e.target.value },
                }))
              }
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">— Select a contact —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Strength (1–5 stars)">
          {() => (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      champion: { ...s.champion, strength: n as 1 | 2 | 3 | 4 | 5 },
                    }))
                  }
                  className={cn(
                    'h-7 w-7 rounded-full text-sm font-semibold',
                    n <= state.champion.strength
                      ? 'bg-amber-400 text-amber-950'
                      : 'bg-slate-100 text-slate-400'
                  )}
                  aria-label={`Strength ${n}`}
                >
                  ★
                </button>
              ))}
            </div>
          )}
        </FormField>
        <FormField label="Notes">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={state.champion.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  champion: { ...s.champion, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
      </Section>

      <Section
        label="Competition"
        description="Deals we're fighting"
        open={open.competition}
        onToggle={() => toggle('competition')}
        binaryIdentified={state.competition.identified}
      >
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.competition.identified}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                competition: { ...s.competition, identified: e.target.checked },
              }))
            }
          />
          Competitors identified
        </label>
        <FormField label="Competitor names">
          {({ id, describedBy }) => (
            <TagInput
              id={id}
              describedBy={describedBy}
              value={state.competition.competitors}
              onChange={(v) =>
                setState((s) => ({
                  ...s,
                  competition: { ...s.competition, competitors: v },
                }))
              }
              placeholder="Type competitor name, press Enter…"
            />
          )}
        </FormField>
        <FormField label="Our differentiators">
          {({ id }) => (
            <Textarea
              id={id}
              rows={3}
              value={state.competition.differentiators}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  competition: {
                    ...s.competition,
                    differentiators: e.target.value,
                  },
                }))
              }
            />
          )}
        </FormField>
        <FormField label="Notes">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={state.competition.notes}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  competition: { ...s.competition, notes: e.target.value },
                }))
              }
            />
          )}
        </FormField>
      </Section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-1 py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'inline-flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold',
              totalScore >= 70
                ? 'bg-emerald-100 text-emerald-800'
                : totalScore >= 40
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
            )}
          >
            {totalScore}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              MEDDIC Score
            </div>
            <div className="text-sm text-slate-700">Live preview</div>
          </div>
        </div>
        {serverError ? (
          <p role="alert" className="text-xs font-medium text-red-600">
            {serverError}
          </p>
        ) : null}
        <Button type="submit" isLoading={updateMeddic.isPending}>
          <CheckIcon size={14} /> Save MEDDIC
        </Button>
      </div>
    </form>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  score?: number;
  binaryIdentified?: boolean;
  children: ReactNode;
}

function Section({
  label,
  description,
  open,
  onToggle,
  score,
  binaryIdentified,
  children,
}: SectionProps) {
  return (
    <div className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDownIcon size={14} />
          ) : (
            <ChevronRightIcon size={14} />
          )}
          <div>
            <div className="text-sm font-semibold text-slate-900">{label}</div>
            <div className="text-xs text-slate-500">{description}</div>
          </div>
        </div>
        {typeof score === 'number' ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {score}/100
          </span>
        ) : binaryIdentified !== undefined ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              binaryIdentified
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            )}
          >
            {binaryIdentified ? 'Identified' : 'Unknown'}
          </span>
        ) : null}
      </button>
      {open ? <div className="space-y-3 px-3 pb-3">{children}</div> : null}
    </div>
  );
}

function ScoreSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-700">
        {value}
      </span>
    </div>
  );
}
