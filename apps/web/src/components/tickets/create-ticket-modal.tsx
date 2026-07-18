'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useUsers } from '@/hooks/use-users';
import {
  useCreateTicket,
  TICKET_PRIORITIES,
  TICKET_CHANNELS,
  type TicketPriority,
  type TicketChannel,
} from '@/hooks/use-tickets';

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, navigate to the created ticket's detail page on success. */
  navigateOnCreate?: boolean;
}

const fieldClass =
  'h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:border-primary';
const fieldStyle = { borderColor: 'var(--border-color)', color: 'var(--text-primary)' } as const;
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--text-muted)' } as const;

export function CreateTicketModal({ open, onClose, navigateOnCreate = true }: CreateTicketModalProps) {
  const router = useRouter();
  const createTicket = useCreateTicket();
  const usersQuery = useUsers({ limit: 200 });
  const users = usersQuery.data?.data ?? [];

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [channel, setChannel] = useState<TicketChannel>('WEB');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const reset = () => {
    setSubject('');
    setDescription('');
    setPriority('MEDIUM');
    setChannel('WEB');
    setRequesterEmail('');
    setAccountId('');
    setAssigneeId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    createTicket.mutate(
      {
        subject: subject.trim(),
        description: description.trim() || undefined,
        priority,
        channel,
        requesterEmail: requesterEmail.trim() || undefined,
        accountId: accountId.trim() || undefined,
        assigneeId: assigneeId || undefined,
      },
      {
        onSuccess: (ticket) => {
          reset();
          onClose();
          if (navigateOnCreate && ticket?.id) router.push(`/tickets/${ticket.id}`);
        },
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New ticket" size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} style={labelStyle} htmlFor="ticket-subject">
            Subject <span className="text-error">*</span>
          </label>
          <input
            id="ticket-subject"
            className={fieldClass}
            style={fieldStyle}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue"
            required
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass} style={labelStyle} htmlFor="ticket-description">
            Description
          </label>
          <textarea
            id="ticket-description"
            className="min-h-[96px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
            style={fieldStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details, steps to reproduce, context…"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="ticket-priority">
              Priority
            </label>
            <select
              id="ticket-priority"
              className={fieldClass}
              style={fieldStyle}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="ticket-channel">
              Channel
            </label>
            <select
              id="ticket-channel"
              className={fieldClass}
              style={fieldStyle}
              value={channel}
              onChange={(e) => setChannel(e.target.value as TicketChannel)}
            >
              {TICKET_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="ticket-requester">
              Requester email
            </label>
            <input
              id="ticket-requester"
              type="email"
              className={fieldClass}
              style={fieldStyle}
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle} htmlFor="ticket-account">
              Account ID
            </label>
            <input
              id="ticket-account"
              className={fieldClass}
              style={fieldStyle}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="Optional account reference"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} style={labelStyle} htmlFor="ticket-assignee">
              Assignee
            </label>
            <select
              id="ticket-assignee"
              className={fieldClass}
              style={fieldStyle}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={createTicket.isPending} disabled={!subject.trim()}>
            Create ticket
          </Button>
        </div>
      </form>
    </Modal>
  );
}
