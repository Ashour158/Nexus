'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck, Target, UserPlus } from 'lucide-react';
import type { CreateLeadInput } from '@nexus/validation';
import { useCreateLead } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { notify } from '@/lib/toast';
import {
  CRMCard,
  CRMFieldGrid,
  CRMFormSection,
  CRMMetricCard,
  CRMMetricGrid,
  CRMPageHeader,
  CRMSidePanel,
} from '@/components/ui/crm';

type LeadSource =
  | 'MANUAL'
  | 'IMPORT'
  | 'WEB_FORM'
  | 'EMAIL_CAMPAIGN'
  | 'SOCIAL_MEDIA'
  | 'PAID_ADS'
  | 'REFERRAL'
  | 'PARTNER'
  | 'CHAT'
  | 'EVENT'
  | 'OTHER';

type LeadRating = 'HOT' | 'WARM' | 'COLD';

type LeadDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  ownerId: string;
  source: LeadSource;
  rating: LeadRating;
  industry: string;
  website: string;
  annualRevenue: string;
  employeeCount: string;
  score: string;
  tags: string;
  notes: string;
  gdprConsent: boolean;
  doNotContact: boolean;
};

const SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'WEB_FORM', label: 'Web Form' },
  { value: 'EMAIL_CAMPAIGN', label: 'Email Campaign' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'PAID_ADS', label: 'Paid Ads' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'CHAT', label: 'Chat' },
  { value: 'EVENT', label: 'Event' },
  { value: 'IMPORT', label: 'Import' },
  { value: 'OTHER', label: 'Other' },
];

const RATING_OPTIONS: Array<{ value: LeadRating; label: string }> = [
  { value: 'HOT', label: 'Hot' },
  { value: 'WARM', label: 'Warm' },
  { value: 'COLD', label: 'Cold' },
];

const initialDraft: LeadDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  ownerId: 'dev-admin',
  source: 'MANUAL',
  rating: 'COLD',
  industry: '',
  website: '',
  annualRevenue: '',
  employeeCount: '',
  score: '50',
  tags: '',
  notes: '',
  gdprConsent: true,
  doNotContact: false,
};

export default function NewLeadPage() {
  const router = useRouter();
  const createLead = useCreateLead();
  const users = useUsers();
  const [draft, setDraft] = useState<LeadDraft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ownerOptions = useMemo(() => {
    const loaded = users.data?.data ?? [];
    return loaded.map((user) => ({ value: user.id, label: `${user.firstName} ${user.lastName}` }));
  }, [users.data]);

  function update<K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!draft.firstName.trim()) next.firstName = 'First name is required';
    if (!draft.lastName.trim()) next.lastName = 'Last name is required';
    if (!draft.ownerId.trim()) next.ownerId = 'Owner is required';
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      next.email = 'Enter a valid email address';
    }
    if (draft.website.trim() && !/^https?:\/\/.+\..+/.test(draft.website.trim())) {
      next.website = 'Use a full URL, for example https://example.com';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function buildPayload(): CreateLeadInput {
    return {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      ownerId: draft.ownerId,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      company: draft.company.trim() || undefined,
      jobTitle: draft.jobTitle.trim() || undefined,
      source: draft.source,
      rating: draft.rating,
      industry: draft.industry.trim() || undefined,
      website: draft.website.trim() || undefined,
      annualRevenue: draft.annualRevenue ? Number(draft.annualRevenue) : undefined,
      employeeCount: draft.employeeCount ? Number(draft.employeeCount) : undefined,
      tags: draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      customFields: draft.notes.trim() ? { notes: draft.notes.trim(), intakeScore: Number(draft.score || 0) } : { intakeScore: Number(draft.score || 0) },
      gdprConsent: draft.gdprConsent,
      doNotContact: draft.doNotContact,
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    createLead.mutate(buildPayload(), {
      onSuccess: () => {
        notify.success('Lead created');
        router.push('/leads');
      },
    });
  }

  return (
    <div className="space-y-6">
      <CRMPageHeader
        eyebrow="Lead intake"
        icon={Target}
        title="Create lead"
        description="Create a clean, coded lead record with ownership, source, consent, and qualification context ready for routing."
        badges={<span className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface-variant">Shared CRM form pattern</span>}
        actions={
          <Link
            href="/leads"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 text-sm font-bold text-on-surface transition hover:bg-surface-container-low"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Leads
          </Link>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={UserPlus} label="Record" value="Lead" note="creates coded CRM item" />
            <CRMMetricCard icon={ShieldCheck} label="Consent" value={draft.gdprConsent ? 'Yes' : 'No'} note="privacy captured" tone={draft.gdprConsent ? 'emerald' : 'amber'} />
            <CRMMetricCard icon={CheckCircle2} label="Owner" value={draft.ownerId ? 'Set' : 'Open'} note="routing ready" />
            <CRMMetricCard icon={FileText} label="Score" value={draft.score || 0} note={`${draft.rating.toLowerCase()} rating`} />
          </CRMMetricGrid>
        }
      />

      <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <CRMFormSection
            title="Identity"
            description="Required fields are kept minimal so sales teams can capture quickly without losing quality."
          >
            <CRMFieldGrid>
              <TextField label="First name" required value={draft.firstName} error={errors.firstName} onChange={(value) => update('firstName', value)} />
              <TextField label="Last name" required value={draft.lastName} error={errors.lastName} onChange={(value) => update('lastName', value)} />
              <TextField label="Email" type="email" value={draft.email} error={errors.email} onChange={(value) => update('email', value)} />
              <TextField label="Phone" value={draft.phone} onChange={(value) => update('phone', value)} />
            </CRMFieldGrid>
          </CRMFormSection>

          <CRMFormSection
            title="Company and qualification"
            description="Use firmographic and source details to drive assignment, scoring, reports, and follow-up."
          >
            <CRMFieldGrid>
              <TextField label="Company" value={draft.company} onChange={(value) => update('company', value)} />
              <TextField label="Job title" value={draft.jobTitle} onChange={(value) => update('jobTitle', value)} />
              <SelectField label="Source" value={draft.source} options={SOURCE_OPTIONS} onChange={(value) => update('source', value as LeadSource)} />
              <SelectField label="Rating" value={draft.rating} options={RATING_OPTIONS} onChange={(value) => update('rating', value as LeadRating)} />
              <TextField label="Industry" value={draft.industry} onChange={(value) => update('industry', value)} />
              <TextField label="Website" value={draft.website} error={errors.website} onChange={(value) => update('website', value)} />
              <TextField label="Annual revenue" type="number" value={draft.annualRevenue} onChange={(value) => update('annualRevenue', value)} />
              <TextField label="Employee count" type="number" value={draft.employeeCount} onChange={(value) => update('employeeCount', value)} />
            </CRMFieldGrid>
          </CRMFormSection>

          <CRMFormSection
            title="Routing and governance"
            description="Every lead should have a responsible owner and clear communication permissions."
          >
            <CRMFieldGrid>
              <SelectField label="Owner" required value={draft.ownerId} error={errors.ownerId} options={ownerOptions} onChange={(value) => update('ownerId', value)} />
              <TextField label="Score" type="number" value={draft.score} onChange={(value) => update('score', value)} />
              <TextField label="Tags" value={draft.tags} hint="Comma separated, for example enterprise, priority" onChange={(value) => update('tags', value)} />
              <div className="grid gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <CheckboxField label="GDPR consent captured" checked={draft.gdprConsent} onChange={(value) => update('gdprConsent', value)} />
                <CheckboxField label="Do not contact" checked={draft.doNotContact} onChange={(value) => update('doNotContact', value)} />
              </div>
            </CRMFieldGrid>
            <TextareaField label="Notes" value={draft.notes} onChange={(value) => update('notes', value)} />
          </CRMFormSection>
        </div>

        <div className="space-y-6">
          <CRMSidePanel title="Creation checklist" description="The same side-panel pattern should be reused for every record creation workflow.">
            <div className="space-y-3 text-sm">
              <CheckItem done={Boolean(draft.firstName && draft.lastName)} label="Identity captured" />
              <CheckItem done={Boolean(draft.ownerId)} label="Owner assigned" />
              <CheckItem done={Boolean(draft.source)} label="Source selected" />
              <CheckItem done={draft.gdprConsent || draft.doNotContact} label="Contact policy clear" />
            </div>
          </CRMSidePanel>

          <CRMCard title="Shared design system" description="This page now uses the reusable CRM UI layer.">
            <ul className="space-y-3 text-sm text-on-surface-variant">
              <li>Cards: `CRMCard`, `CRMFormSection`</li>
              <li>Forms: field grids, consistent inputs, validation copy</li>
              <li>Dashboards: `CRMPageHeader`, metrics</li>
              <li>Side panels: `CRMSidePanel`</li>
              <li>Badges, filters, and tables are available in the same layer</li>
            </ul>
          </CRMCard>

          <div className="sticky bottom-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-lg">
            <button
              type="submit"
              disabled={createLead.isPending}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4f46e5] px-4 text-sm font-bold text-white transition hover:bg-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {createLead.isPending ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-on-surface">
        {label} {required ? <span className="text-error">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/30"
      />
      {hint && !error ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-semibold text-error">{error}</p> : null}
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-on-surface">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-3 text-sm text-on-surface outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required,
  error,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-on-surface">
        {label} {required ? <span className="text-error">*</span> : null}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs font-semibold text-error">{error}</p> : null}
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm font-semibold text-on-surface">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-outline-variant text-[#4f46e5] focus:ring-primary/30"
      />
      {label}
    </label>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
      <span className={done ? 'text-success' : 'text-outline'}>
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <span className={done ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>{label}</span>
    </div>
  );
}
