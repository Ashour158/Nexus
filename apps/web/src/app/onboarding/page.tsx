'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  GitBranch,
  Users,
  Upload,
  CheckCircle2,
  Check,
  ArrowRight,
  ArrowLeft,
  PartyPopper,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUpsertCompany, type CompanyUpsert } from '@/hooks/use-org';
import { useCreatePipeline } from '@/hooks/use-pipelines';
import { useInviteUser, useRoles } from '@/hooks/use-users';
import { useOnboarding, useUpdateOnboarding } from '@/hooks/use-onboarding';

/**
 * First-run Onboarding Wizard (PC-20 / LR-01).
 *
 * A 5-step stepper that reuses existing hooks/endpoints:
 *  1. Company profile     → useUpsertCompany (auth-service PUT /company)
 *  2. First pipeline      → useCreatePipeline (crm BFF POST /api/crm/pipelines)
 *  3. Invite team         → useInviteUser (auth-service POST /users/invite) — skippable
 *  4. Import data         → links to /settings/migration CSV wizard — skippable
 *  5. Done                → marks onboarding complete, links into the app
 *
 * Progress + completion persist per-tenant via /api/onboarding.
 */

const STEPS = [
  { id: 'profile', label: 'Company', icon: Building2 },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { id: 'team', label: 'Invite team', icon: Users },
  { id: 'import', label: 'Import data', icon: Upload },
  { id: 'done', label: 'Done', icon: CheckCircle2 },
] as const;

const inputClass =
  'w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

function Banner({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <div
      role={kind === 'err' ? 'alert' : 'status'}
      aria-live={kind === 'err' ? 'assertive' : 'polite'}
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        kind === 'ok'
          ? 'border-success/30 bg-success-container text-on-success-container'
          : 'border-error/30 bg-error-container text-on-error-container'
      }`}
    >
      {text}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: state } = useOnboarding();
  const updateOnboarding = useUpdateOnboarding();

  const [stepIndex, setStepIndex] = useState(0);
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>({});

  // Mark the wizard as "seen" so middleware stops force-redirecting here — this
  // is what lets the user skip freely without bouncing back into a loop.
  useEffect(() => {
    document.cookie = 'nexus_onboarding_seen=1; path=/; max-age=31536000; samesite=lax; secure';
  }, []);

  // If the server-side store already reports onboarding complete (returning
  // user who simply lacked the cookie), flag it and send them into the app.
  useEffect(() => {
    if (state?.completed) {
      document.cookie = 'nexus_onboarded=1; path=/; max-age=31536000; samesite=lax; secure';
      router.replace('/dashboard');
    }
  }, [state?.completed, router]);

  // Seed local completion state from the persisted store once loaded.
  useEffect(() => {
    if (state?.steps) setDoneSteps((prev) => ({ ...state.steps, ...prev }));
  }, [state?.steps]);

  const step = STEPS[stepIndex];

  function persist(patch: { steps?: Record<string, boolean>; completed?: boolean }) {
    updateOnboarding.mutate(patch);
  }

  function markStepDone(id: string) {
    setDoneSteps((prev) => ({ ...prev, [id]: true }));
    persist({ steps: { [id]: true } });
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function completeOnboarding() {
    // Persist completion server-side BEFORE dropping the cookie / navigating,
    // otherwise a slow or failed update leaves the tenant marked incomplete.
    try {
      await updateOnboarding.mutateAsync({ completed: true, steps: { done: true } });
    } catch {
      // Best-effort: still let the user into the app if persistence fails.
    }
    document.cookie = 'nexus_onboarded=1; path=/; max-age=31536000; samesite=lax; secure';
    router.push('/dashboard');
  }

  // A step is reachable if it's the current/prior step, or both required steps
  // (company profile + first pipeline) are already done.
  const requiredStepsDone = Boolean(doneSteps.profile) && Boolean(doneSteps.pipeline);
  function canNavigateTo(i: number) {
    return i <= stepIndex || requiredStepsDone;
  }

  return (
    <main className="min-h-screen bg-surface-container-low">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-on-surface">Welcome to NEXUS</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            A few quick steps to set up your workspace. You can skip optional steps and finish later.
          </p>
        </header>

        {/* Stepper / progress indicator */}
        <ol className="mb-8 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const isActive = i === stepIndex;
            const isComplete = Boolean(doneSteps[s.id]);
            const reachable = canNavigateTo(i);
            const Icon = s.icon;
            return (
              <li key={s.id} className="flex flex-1 flex-col items-center">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => { if (reachable) setStepIndex(i); }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed ${
                    isActive
                      ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
                      : isComplete
                        ? 'border-success bg-success text-white'
                        : 'border-outline-variant bg-surface text-on-surface-variant'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={s.label}
                >
                  {isComplete && !isActive ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </button>
                <span
                  className={`mt-2 hidden text-xs sm:block ${
                    isActive ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-outline-variant bg-surface p-6 shadow-sm">
          {step.id === 'profile' ? (
            <CompanyStep onSaved={() => { markStepDone('profile'); goNext(); }} />
          ) : null}
          {step.id === 'pipeline' ? (
            <PipelineStep onCreated={() => { markStepDone('pipeline'); goNext(); }} onBack={goBack} />
          ) : null}
          {step.id === 'team' ? (
            <TeamStep
              onInvited={() => markStepDone('team')}
              onNext={goNext}
              onBack={goBack}
            />
          ) : null}
          {step.id === 'import' ? (
            <ImportStep onNext={goNext} onBack={goBack} />
          ) : null}
          {step.id === 'done' ? (
            <DoneStep onFinish={completeOnboarding} isSaving={updateOnboarding.isPending} />
          ) : null}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-on-surface-variant hover:text-on-surface-variant">
            Skip onboarding for now
          </Link>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Company profile (reuses useUpsertCompany)                          */
/* -------------------------------------------------------------------------- */

function CompanyStep({ onSaved }: { onSaved: () => void }) {
  const upsert = useUpsertCompany();
  const [form, setForm] = useState<Pick<CompanyUpsert, 'name' | 'industry' | 'logoUrl'>>({
    name: '',
    industry: '',
    logoUrl: '',
  });
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) {
      setBanner({ kind: 'err', text: 'Company name is required.' });
      return;
    }
    setBanner(null);
    try {
      await upsert.mutateAsync({
        name: form.name.trim(),
        industry: form.industry?.trim() || undefined,
        logoUrl: form.logoUrl?.trim() || undefined,
      } as CompanyUpsert);
      onSaved();
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="mb-1 text-lg font-semibold text-on-surface">Tell us about your company</h2>
      <p className="mb-5 text-sm text-on-surface-variant">This appears across your workspace. You can refine it later in Settings.</p>
      {banner ? <Banner kind={banner.kind} text={banner.text} /> : null}
      <div className="space-y-4">
        <Field label="Company name *">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Acme Inc."
            autoFocus
          />
        </Field>
        <Field label="Industry">
          <input
            className={inputClass}
            value={form.industry ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
            placeholder="e.g. Software, Manufacturing"
          />
        </Field>
        <Field label="Logo URL (optional)">
          <input
            className={inputClass}
            value={form.logoUrl ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
            placeholder="https://…/logo.png"
          />
        </Field>
      </div>
      <div className="mt-6 flex items-center justify-end">
        <Button type="submit" isLoading={upsert.isPending} className="bg-[#4f46e5] hover:bg-[#0f6fd4]">
          Save &amp; continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — First pipeline (reuses useCreatePipeline)                          */
/* -------------------------------------------------------------------------- */

function PipelineStep({ onCreated, onBack }: { onCreated: () => void; onBack: () => void }) {
  const createPipeline = useCreatePipeline();
  const [name, setName] = useState('Sales Pipeline');
  const [currency, setCurrency] = useState('USD');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setBanner({ kind: 'err', text: 'Pipeline name is required.' });
      return;
    }
    setBanner(null);
    // Normalise + validate the ISO-4217-style code; fall back to USD when the
    // input isn't exactly three letters so we never send a malformed currency.
    const normalizedCurrency = currency.trim().toUpperCase();
    const safeCurrency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'USD';
    try {
      await createPipeline.mutateAsync({ name: name.trim(), currency: safeCurrency });
      onCreated();
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Could not create pipeline.' });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="mb-1 text-lg font-semibold text-on-surface">Create your first pipeline</h2>
      <p className="mb-5 text-sm text-on-surface-variant">
        We&apos;ll create a pipeline with a starter stage. Add and rename stages any time in Settings.
      </p>
      {banner ? <Banner kind={banner.kind} text={banner.text} /> : null}
      <div className="space-y-4">
        <Field label="Pipeline name *">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Currency">
          <input
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            placeholder="USD"
            maxLength={8}
          />
        </Field>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button type="submit" isLoading={createPipeline.isPending} className="bg-[#4f46e5] hover:bg-[#0f6fd4]">
          Create &amp; continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Invite team (reuses useInviteUser + useRoles). Skippable.          */
/* -------------------------------------------------------------------------- */

function TeamStep({
  onInvited,
  onNext,
  onBack,
}: {
  onInvited: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const invite = useInviteUser();
  const { data: rolesResult } = useRoles();
  const roles = useMemo(() => rolesResult?.data ?? [], [rolesResult]);
  const defaultRoleId = useMemo(
    () => roles.find((r) => /member|user|sales/i.test(r.name))?.id ?? roles[0]?.id ?? '',
    [roles]
  );

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [invited, setInvited] = useState(false);

  const effectiveRole = roleId || defaultRoleId;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setBanner({ kind: 'err', text: 'Email is required to send an invite.' });
      return;
    }
    setBanner(null);
    try {
      await invite.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim() || email.split('@')[0],
        lastName: lastName.trim() || '',
        roleIds: effectiveRole ? [effectiveRole] : [],
        sendEmail: true,
      });
      setInvited(true);
      onInvited();
      setBanner({ kind: 'ok', text: `Invitation sent to ${email.trim()}.` });
      setEmail('');
      setFirstName('');
      setLastName('');
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Could not send invite.' });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="mb-1 text-lg font-semibold text-on-surface">Invite your team</h2>
      <p className="mb-5 text-sm text-on-surface-variant">
        Send an invite to a teammate, or skip and add people later from Settings.
      </p>
      {banner ? <Banner kind={banner.kind} text={banner.text} /> : null}
      <div className="space-y-4">
        <Field label="Email *">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        {roles.length > 0 ? (
          <Field label="Role">
            <select className={inputClass} value={effectiveRole} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onNext}>
            {invited ? 'Continue' : 'Skip'}
          </Button>
          <Button type="submit" isLoading={invite.isPending} className="bg-[#4f46e5] hover:bg-[#0f6fd4]">
            Send invite
          </Button>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Import data (links to existing CSV migration wizard). Skippable.   */
/* -------------------------------------------------------------------------- */

function ImportStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-on-surface">Import your existing data</h2>
      <p className="mb-5 text-sm text-on-surface-variant">
        Bring contacts and accounts from Salesforce, HubSpot, or a CSV export. This opens the migration
        wizard in a new tab so you can return here when you&apos;re done.
      </p>
      <Link
        href="/settings/migration"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl border-2 border-dashed border-outline-variant p-5 transition-colors hover:border-[#4f46e5] hover:bg-primary-container/40"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-container text-[#4f46e5]">
          <Upload className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-medium text-on-surface">Open CSV / CRM import wizard</span>
          <span className="block text-xs text-on-surface-variant">Salesforce, HubSpot, or generic CSV</span>
        </span>
        <ArrowRight className="ml-auto h-4 w-4 text-on-surface-variant" />
      </Link>
      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button type="button" onClick={onNext} className="bg-[#4f46e5] hover:bg-[#0f6fd4]">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 5 — Done                                                               */
/* -------------------------------------------------------------------------- */

function DoneStep({ onFinish, isSaving }: { onFinish: () => void; isSaving: boolean }) {
  const links = [
    { href: '/deals', label: 'View deals' },
    { href: '/contacts', label: 'View contacts' },
    { href: '/pipeline', label: 'Open pipeline' },
    { href: '/settings', label: 'Settings' },
  ];
  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-container text-success">
        <PartyPopper className="h-7 w-7" />
      </span>
      <h2 className="mb-1 text-lg font-semibold text-on-surface">You&apos;re all set</h2>
      <p className="mb-6 text-sm text-on-surface-variant">
        Your workspace is ready. Jump into the app — you can always revisit Settings to fine-tune things.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-outline-variant px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <Button
        type="button"
        onClick={onFinish}
        isLoading={isSaving}
        fullWidth
        className="bg-[#4f46e5] hover:bg-[#0f6fd4]"
      >
        Finish &amp; go to dashboard
      </Button>
    </div>
  );
}
