import { randomUUID } from 'node:crypto';

/**
 * Minimal, dependency-free RFC 5545 (iCalendar) VEVENT builder.
 *
 * Produces a valid `.ics` string for a single meeting so it can be attached to
 * (or embedded in) meeting emails. Pure string building — no new npm deps.
 *
 * Fail-open by design: callers should wrap invocation in try/catch. This module
 * itself never throws for ordinary inputs; it clamps a missing/invalid end time
 * to start + 30 minutes rather than failing.
 */

export interface IcsEvent {
  /** Globally-unique event id. If omitted a UUID is generated. */
  uid?: string;
  /** Event start. Accepts a Date or an ISO-8601 string. */
  start: Date | string;
  /** Event end. If omitted/invalid, defaults to start + 30 minutes. */
  end?: Date | string;
  /** Short one-line title (SUMMARY). */
  summary: string;
  /** Optional longer description. */
  description?: string;
  /** Optional location string. */
  location?: string;
  /** Organizer email (ORGANIZER;CN). */
  organizerEmail?: string;
  /** Organizer display name. */
  organizerName?: string;
  /** Attendee emails (each becomes an ATTENDEE line). */
  attendeeEmails?: string[];
  /** METHOD (e.g. REQUEST, PUBLISH, CANCEL). Defaults to REQUEST. */
  method?: string;
}

function toDate(value: Date | string | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as an RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ. */
function formatUtc(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Escape a value for a TEXT property per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line to <=75 octets per RFC 5545 §3.1 (CRLF + space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join('\r\n');
}

/**
 * Build a full VCALENDAR document (as a CRLF-joined string) for a single event.
 * Returns `null` if the start time is missing/invalid so callers can fail open.
 */
export function buildIcs(event: IcsEvent): string | null {
  const start = toDate(event.start);
  if (!start) return null;

  let end = toDate(event.end);
  if (!end || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 30 * 60 * 1000);
  }

  const uid = (event.uid && event.uid.trim()) || `${randomUUID()}@nexuscrm`;
  const method = (event.method && event.method.trim().toUpperCase()) || 'REQUEST';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nexus CRM//comm-service//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(event.summary || 'Meeting')}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  if (event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${escapeText(event.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${event.organizerEmail}`);
  }
  for (const attendee of event.attendeeEmails ?? []) {
    if (!attendee) continue;
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`
    );
  }

  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}
