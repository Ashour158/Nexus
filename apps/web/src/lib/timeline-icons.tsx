import type { ReactNode } from 'react';
import {
  Phone,
  Mail,
  MessageCircle,
  MessageSquare,
  Calendar,
  FileText,
  GitCommitVertical,
  Sparkles,
  Activity as ActivityIcon,
} from 'lucide-react';

/**
 * Maps a timeline entry to an icon + human label. Timeline events carry a
 * source `type` (ACTIVITY, NOTE, STAGE_CHANGE, ...); ACTIVITY events carry the
 * concrete sub-type (CALL, EMAIL, CHAT, WHATSAPP, ...) in metadata. The backend
 * already projects call/email/portal events onto the timeline, so we normalise
 * both shapes here.
 */

interface TimelineMeta {
  icon: ReactNode;
  label: string;
}

const CHANNEL_META: Record<string, TimelineMeta> = {
  CALL: { icon: <Phone className="h-4 w-4 text-success" />, label: 'Call' },
  EMAIL: { icon: <Mail className="h-4 w-4 text-primary" />, label: 'Email' },
  CHAT: { icon: <MessageSquare className="h-4 w-4 text-primary" />, label: 'Chat' },
  WHATSAPP: { icon: <MessageCircle className="h-4 w-4 text-success" />, label: 'WhatsApp' },
  WHATS_APP: { icon: <MessageCircle className="h-4 w-4 text-success" />, label: 'WhatsApp' },
  MEETING: { icon: <Calendar className="h-4 w-4 text-tertiary" />, label: 'Meeting' },
  NOTE: { icon: <FileText className="h-4 w-4 text-on-surface-variant" />, label: 'Note' },
  TASK: { icon: <MessageSquare className="h-4 w-4 text-warning" />, label: 'Task' },
  STAGE_CHANGE: { icon: <GitCommitVertical className="h-4 w-4 text-warning" />, label: 'Stage change' },
  STATUS_CHANGE: { icon: <GitCommitVertical className="h-4 w-4 text-warning" />, label: 'Status change' },
  CREATED: { icon: <Sparkles className="h-4 w-4 text-success" />, label: 'Created' },
};

const DEFAULT_META: TimelineMeta = { icon: <ActivityIcon className="h-4 w-4 text-on-surface-variant" />, label: 'Activity' };

function pickKey(row: Record<string, unknown>): string {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const candidate =
    metadata.activityType ??
    metadata.channel ??
    metadata.subType ??
    row.channel ??
    row.activityType ??
    row.type ??
    row.kind;
  return String(candidate ?? '').toUpperCase().replace(/[\s-]+/g, '_');
}

export function timelineMeta(row: Record<string, unknown>): TimelineMeta {
  return CHANNEL_META[pickKey(row)] ?? DEFAULT_META;
}

/** Icon-only helper for compact rows. */
export function TimelineIcon({ row }: { row: Record<string, unknown> }) {
  return <>{timelineMeta(row).icon}</>;
}
