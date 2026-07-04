/**
 * In-memory dev-preview store for comm-service CTI telephony
 * (/api/v1/telephony/**). Backs the click-to-call button + call history list
 * without a live comm-service. Persists across requests within a dev process.
 */

export interface TelephonyCall {
  id: string;
  callId: string;
  callSid: string;
  toNumber: string;
  contactId?: string;
  dealId?: string;
  accountId?: string;
  status: string;
  direction: 'outbound' | 'inbound';
  startedAt: string;
  durationSeconds?: number;
}

interface TelephonyState {
  calls: TelephonyCall[];
}

const g = globalThis as unknown as { __nexusTelephonyStore?: TelephonyState };

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function store(): TelephonyState {
  if (!g.__nexusTelephonyStore) {
    g.__nexusTelephonyStore = { calls: [] };
  }
  return g.__nexusTelephonyStore;
}

export function clickToCall(input: {
  toNumber?: string;
  contactId?: string;
  dealId?: string;
  accountId?: string;
}): { callId: string; callSid: string; status: string } {
  const call: TelephonyCall = {
    id: id('call'),
    callId: id('cid'),
    callSid: `CA${Math.random().toString(36).slice(2, 12)}`,
    toNumber: input.toNumber ?? '',
    contactId: input.contactId,
    dealId: input.dealId,
    accountId: input.accountId,
    status: 'queued',
    direction: 'outbound',
    startedAt: new Date().toISOString(),
  };
  store().calls.unshift(call);
  return { callId: call.callId, callSid: call.callSid, status: call.status };
}

export function listCalls(filter: {
  contactId?: string;
  dealId?: string;
  accountId?: string;
}): TelephonyCall[] {
  return store().calls.filter((c) => {
    if (filter.contactId && c.contactId !== filter.contactId) return false;
    if (filter.dealId && c.dealId !== filter.dealId) return false;
    if (filter.accountId && c.accountId !== filter.accountId) return false;
    return true;
  });
}
