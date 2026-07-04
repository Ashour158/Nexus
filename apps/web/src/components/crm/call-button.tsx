'use client';

import { useState } from 'react';
import { Phone, PhoneCall, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { notify } from '@/lib/toast';
import {
  useClickToCall,
  useCallHistory,
  TelephonyNotConfiguredError,
  type CallHistoryFilter,
} from '@/hooks/use-telephony';

interface CallButtonProps extends CallHistoryFilter {
  /** Pre-filled number (e.g. contact.phone). Editable in the dialog. */
  defaultNumber?: string | null;
  /** Disable when the record has opted out of calls. */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Click-to-call button + call-history popover for a contact/deal/account.
 * POSTs to /api/telephony/click-to-call; 503 -> "Telephony not configured".
 */
export function CallButton({ defaultNumber, contactId, dealId, accountId, disabled, disabledReason }: CallButtonProps) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(defaultNumber ?? '');
  const clickToCall = useClickToCall();
  const filter: CallHistoryFilter = { contactId, dealId, accountId };
  const { data: calls, isLoading } = useCallHistory(filter);

  const placeCall = async () => {
    if (!number.trim()) {
      notify.error('Enter a number to call');
      return;
    }
    try {
      const res = await clickToCall.mutateAsync({ toNumber: number.trim(), contactId, dealId, accountId });
      notify.success(`Call initiated (${res.status})`);
    } catch (err) {
      if (err instanceof TelephonyNotConfiguredError) {
        notify.error('Telephony not configured', 'Configure a telephony provider in settings to place calls.');
      } else {
        notify.error('Call failed', err instanceof Error ? err.message : undefined);
      }
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledReason : undefined}>
        <Phone className="h-4 w-4" /> Call
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Click to call" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Number</label>
            <div className="flex gap-2">
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+1 555 0100" type="tel" />
              <Button onClick={placeCall} isLoading={clickToCall.isPending}>
                <PhoneCall className="h-4 w-4" /> Call
              </Button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <History className="h-3.5 w-3.5" /> Call history
            </h3>
            {isLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : !calls || calls.length === 0 ? (
              <p className="text-sm text-slate-400">No calls yet for this record.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {calls.map((call) => (
                  <li key={call.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-700">{call.toNumber || '—'}</span>
                    <span className="text-xs text-slate-500">
                      {call.status} · {new Date(call.startedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
