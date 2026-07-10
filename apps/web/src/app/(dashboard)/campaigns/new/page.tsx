'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Megaphone, Save } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import { useCreateCampaign, type CampaignType } from '@/hooks/use-campaigns';
import { CAMPAIGN_TYPES } from '@/components/campaigns/campaign-ui';
import {
  CRMFieldGrid,
  CRMFormSection,
  CRMModuleShell,
  CRMPageHeader,
} from '@/components/ui/crm';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-bold uppercase tracking-wider text-slate-500';

export default function NewCampaignPage() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const create = useCreateCampaign();

  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('EMAIL');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  function handleSubmit() {
    if (!name.trim()) {
      notify.error('Campaign name is required');
      return;
    }
    if (!userId) {
      notify.error('No active user session — cannot set campaign owner');
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        type,
        subject: subject.trim() || undefined,
        fromName: fromName.trim() || undefined,
        fromEmail: fromEmail.trim() || undefined,
        contentHtml: contentHtml.trim() || undefined,
        // datetime-local yields "YYYY-MM-DDTHH:mm" — promote to ISO for the API.
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        ownerId: userId,
      },
      {
        onSuccess: (campaign) => router.push(`/campaigns/${campaign.id}`),
      }
    );
  }

  return (
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Marketing"
        icon={Megaphone}
        title="New campaign"
        description="Set up a campaign in DRAFT. You can add members and launch it from the campaign detail page."
        actions={
          <Link
            href="/campaigns"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      <CRMFormSection
        title="Campaign details"
        description="Only a name and type are required. Everything else can be edited later."
      >
        <div>
          <label className={labelClass} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 product launch"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <CRMFieldGrid>
          <div>
            <label className={labelClass} htmlFor="type">
              Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CampaignType)}
              className={`mt-1 ${inputClass}`}
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="scheduledAt">
              Scheduled at (optional)
            </label>
            <input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </CRMFieldGrid>

        <div>
          <label className={labelClass} htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <CRMFieldGrid>
          <div>
            <label className={labelClass} htmlFor="fromName">
              From name
            </label>
            <input
              id="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Nexus Marketing"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="fromEmail">
              From email
            </label>
            <input
              id="fromEmail"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="marketing@nexuscrm.app"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </CRMFieldGrid>

        <div>
          <label className={labelClass} htmlFor="content">
            Content (HTML)
          </label>
          <textarea
            id="content"
            value={contentHtml}
            onChange={(e) => setContentHtml(e.target.value)}
            rows={8}
            placeholder="<h1>Hello {{first_name}}</h1>…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link
            href="/campaigns"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={create.isPending || !name.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#4f46e5] px-5 text-sm font-bold text-white hover:bg-[#4f46e5] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {create.isPending ? 'Creating…' : 'Create campaign'}
          </button>
        </div>
      </CRMFormSection>
    </CRMModuleShell>
  );
}
