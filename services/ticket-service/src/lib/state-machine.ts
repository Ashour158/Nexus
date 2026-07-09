/**
 * Ticket status state machine.
 *
 *   NEW ─▶ OPEN ─▶ PENDING / ON_HOLD ─▶ RESOLVED ─▶ CLOSED
 *
 * Agents may move a ticket forward, park it (PENDING / ON_HOLD), resolve and
 * close it. RESOLVED and CLOSED tickets may be *reopened* back to OPEN, which
 * the service counts via `reopenCount`.
 */
export type TicketStatus = 'NEW' | 'OPEN' | 'PENDING' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  OPEN: ['PENDING', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  PENDING: ['OPEN', 'ON_HOLD', 'RESOLVED', 'CLOSED'],
  ON_HOLD: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'], // OPEN = reopen
  CLOSED: ['OPEN'], // OPEN = reopen
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** A move into OPEN from a terminal state is a reopen. */
export function isReopen(from: TicketStatus, to: TicketStatus): boolean {
  return (from === 'RESOLVED' || from === 'CLOSED') && to === 'OPEN';
}

export function allowedNextStates(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}
