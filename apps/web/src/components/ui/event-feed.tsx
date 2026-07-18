'use client';

import { cn } from '@/lib/cn';
import {
  UserPlus,
  Mail,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';

export interface FeedEvent {
  id: string;
  type: 'deal_moved' | 'contact_created' | 'email_sent' | 'deal_won' | 'task_completed' | 'alert';
  actor: string;
  action: string;
  timestamp: string;
}

interface EventFeedProps {
  events: FeedEvent[];
  className?: string;
  maxHeight?: number;
}

const eventIcons: Record<FeedEvent['type'], LucideIcon> = {
  deal_moved: Briefcase,
  contact_created: UserPlus,
  email_sent: Mail,
  deal_won: CheckCircle2,
  task_completed: CheckCircle2,
  alert: AlertCircle,
};

const eventColors: Record<FeedEvent['type'], string> = {
  deal_moved: 'text-primary bg-primary-container',
  contact_created: 'text-success bg-success-container',
  email_sent: 'text-on-surface-variant bg-surface-container-low',
  deal_won: 'text-success bg-success-container',
  task_completed: 'text-primary bg-primary-light',
  alert: 'text-warning bg-warning-container',
};

export function EventFeed({ events, className, maxHeight = 320 }: EventFeedProps) {
  return (
    <div
      className={cn('space-y-3 overflow-y-auto pr-1', className)}
      style={{ maxHeight }}
    >
      {events.map((event) => {
        const Icon = eventIcons[event.type];
        return (
          <div key={event.id} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                eventColors[event.type]
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <span className="font-medium">{event.actor}</span>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>{event.action}</span>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {event.timestamp}
              </p>
            </div>
          </div>
        );
      })}
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No recent events
        </p>
      ) : null}
    </div>
  );
}
