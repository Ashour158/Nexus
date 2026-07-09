'use client';

import type { CampaignStatus, CampaignType, MemberStatus } from '@/hooks/use-campaigns';

type Tone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

export const CAMPAIGN_TYPES: CampaignType[] = [
  'EMAIL',
  'SOCIAL',
  'EVENT',
  'WEBINAR',
  'PAID',
  'OTHER',
];

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
];

// Mirrors the server-side state machine in campaigns.service.ts so the UI only
// offers valid next states.
export const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'RUNNING', 'ARCHIVED'],
  SCHEDULED: ['RUNNING', 'PAUSED', 'DRAFT', 'ARCHIVED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'ARCHIVED'],
  PAUSED: ['RUNNING', 'COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function statusTone(status: CampaignStatus): Tone {
  switch (status) {
    case 'RUNNING':
      return 'emerald';
    case 'SCHEDULED':
      return 'blue';
    case 'PAUSED':
      return 'amber';
    case 'COMPLETED':
      return 'slate';
    case 'ARCHIVED':
      return 'slate';
    case 'DRAFT':
    default:
      return 'orange';
  }
}

export function typeTone(type: CampaignType): Tone {
  switch (type) {
    case 'EMAIL':
      return 'blue';
    case 'SOCIAL':
      return 'emerald';
    case 'EVENT':
      return 'amber';
    case 'WEBINAR':
      return 'orange';
    case 'PAID':
      return 'rose';
    default:
      return 'slate';
  }
}

export function memberStatusTone(status: MemberStatus): Tone {
  switch (status) {
    case 'CONVERTED':
      return 'emerald';
    case 'CLICKED':
      return 'blue';
    case 'OPENED':
      return 'blue';
    case 'SENT':
      return 'slate';
    case 'BOUNCED':
      return 'rose';
    case 'UNSUBSCRIBED':
      return 'amber';
    case 'PENDING':
    default:
      return 'orange';
  }
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
