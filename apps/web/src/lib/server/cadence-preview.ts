import { createId } from '@/lib/server/dev-preview-data';

export type PreviewCadenceStep = {
  position: number;
  type: 'EMAIL' | 'CALL_TASK' | 'LINKEDIN_TASK' | 'SMS' | 'WAIT';
  delayDays?: number;
  subject?: string;
  body?: string;
  taskTitle?: string;
  variantB?: Record<string, unknown>;
};

export type PreviewCadence = {
  id: string;
  name: string;
  description?: string;
  objectType: 'CONTACT' | 'LEAD';
  isActive: boolean;
  exitOnReply: boolean;
  exitOnMeeting: boolean;
  steps: PreviewCadenceStep[];
  enrolledCount: number;
  enrollmentCount: number;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __nexusCadencePreviewState: { cadences: PreviewCadence[] } | undefined;
}

export function getCadencePreviewState() {
  if (!globalThis.__nexusCadencePreviewState) {
    const now = new Date().toISOString();
    globalThis.__nexusCadencePreviewState = {
      cadences: [
        {
          id: 'cadence-enterprise-contact-nurture',
          name: 'Enterprise Contact Nurture',
          description: 'High-value contact sequence with reply and meeting exits.',
          objectType: 'CONTACT',
          isActive: true,
          exitOnReply: true,
          exitOnMeeting: true,
          enrolledCount: 42,
          enrollmentCount: 42,
          stepCount: 3,
          createdAt: now,
          updatedAt: now,
          steps: [
            {
              position: 1,
              type: 'EMAIL',
              subject: 'Confirming next CRM expansion steps',
              body: 'Personalized enterprise follow-up with account context.',
            },
            { position: 2, type: 'WAIT', delayDays: 2 },
            { position: 3, type: 'CALL_TASK', taskTitle: 'Call stakeholder and confirm buying committee' },
          ],
        },
        {
          id: 'cadence-inbound-lead-qualification',
          name: 'Inbound Lead Qualification',
          description: 'Fast response sequence for new qualified leads.',
          objectType: 'LEAD',
          isActive: true,
          exitOnReply: true,
          exitOnMeeting: false,
          enrolledCount: 28,
          enrollmentCount: 28,
          stepCount: 3,
          createdAt: now,
          updatedAt: now,
          steps: [
            { position: 1, type: 'EMAIL', subject: 'Thanks for your CRM interest', body: 'Discovery CTA.' },
            { position: 2, type: 'WAIT', delayDays: 1 },
            { position: 3, type: 'LINKEDIN_TASK', taskTitle: 'Connect with lead on LinkedIn' },
          ],
        },
      ],
    };
  }
  return globalThis.__nexusCadencePreviewState;
}

export function normalizeCadence(body: Record<string, unknown>, existing?: PreviewCadence): PreviewCadence {
  const now = new Date().toISOString();
  const steps = Array.isArray(body.steps) ? (body.steps as PreviewCadenceStep[]) : existing?.steps ?? [];
  const normalizedSteps = steps.map((step, index) => ({ ...step, position: step.position ?? index + 1 }));
  const enrollmentCount =
    Number(body.enrollmentCount ?? body.enrolledCount ?? existing?.enrollmentCount ?? existing?.enrolledCount ?? 0) || 0;

  return {
    id: existing?.id ?? createId('cadence'),
    name: String(body.name ?? existing?.name ?? 'Untitled cadence'),
    description: typeof body.description === 'string' ? body.description : existing?.description ?? '',
    objectType: body.objectType === 'LEAD' ? 'LEAD' : existing?.objectType ?? 'CONTACT',
    isActive: typeof body.isActive === 'boolean' ? body.isActive : existing?.isActive ?? true,
    exitOnReply: typeof body.exitOnReply === 'boolean' ? body.exitOnReply : existing?.exitOnReply ?? true,
    exitOnMeeting: typeof body.exitOnMeeting === 'boolean' ? body.exitOnMeeting : existing?.exitOnMeeting ?? false,
    enrolledCount: enrollmentCount,
    enrollmentCount,
    stepCount: normalizedSteps.length,
    steps: normalizedSteps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
