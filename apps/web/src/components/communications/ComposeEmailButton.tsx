'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { notify } from '@/lib/toast';

type ComposeEntityType = 'contact' | 'account';

interface ComposeEmailButtonProps {
  entityType: ComposeEntityType;
  entityId: string;
  /** Pre-filled recipient (e.g. contact.email / account.email). Editable in the dialog. */
  to?: string | null;
  /** Disable when the record has opted out of email. */
  disabled?: boolean;
  disabledReason?: string;
  /** Optional visual variant for the trigger button. */
  variant?: 'primary' | 'secondary';
}

interface EmailTemplate {
  id: string;
  name: string;
  subject?: string | null;
  body?: string | null;
  htmlBody?: string | null;
}

/**
 * Compose + send an ad-hoc email that is linked to a contact or account.
 * POSTs to /api/outbox/send with { channel:'EMAIL', to, subject, htmlBody, entityType, entityId },
 * which routes through comm-service and associates the message with the record.
 * Optionally seeds subject/body from an active email template (GET /api/templates/email).
 */
export function ComposeEmailButton({
  entityType,
  entityId,
  to,
  disabled,
  disabledReason,
  variant = 'secondary',
}: ComposeEmailButtonProps) {
  const [open, setOpen] = useState(false);
  const [toAddress, setToAddress] = useState(to ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ['email-templates', 'active'],
    queryFn: () =>
      fetch('/api/templates/email?isActive=true')
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : (d?.data ?? d?.templates ?? []))),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const sendMutation = useMutation({
    mutationFn: (payload: {
      channel: 'EMAIL';
      to: string;
      subject: string;
      htmlBody: string;
      entityType: ComposeEntityType;
      entityId: string;
    }) =>
      fetch('/api/outbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err?.error || err?.message || 'Failed to send email');
        }
        return r.json().catch(() => ({}));
      }),
    onSuccess: () => {
      notify.success('Email queued');
      setOpen(false);
      setSubject('');
      setBody('');
      setTemplateId('');
      setToAddress(to ?? '');
    },
    onError: (err: unknown) =>
      notify.error('Failed to send email', err instanceof Error ? err.message : undefined),
  });

  const canSend = useMemo(
    () => Boolean(toAddress.trim() && subject.trim() && body.trim()),
    [toAddress, subject, body]
  );

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (tpl.subject) setSubject(tpl.subject);
    const tplBody = tpl.htmlBody ?? tpl.body ?? '';
    if (tplBody) setBody(tplBody);
  };

  const send = () => {
    if (!canSend) {
      notify.error('To, subject and message are required');
      return;
    }
    sendMutation.mutate({
      channel: 'EMAIL',
      to: toAddress.trim(),
      subject: subject.trim(),
      htmlBody: body,
      entityType,
      entityId,
    });
  };

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        <Mail className="h-4 w-4" /> Email
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Compose email" size="xl">
        <div className="space-y-4">
          {templates.length > 0 ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Template</label>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">To</label>
            <Input
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="name@example.com"
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} isLoading={sendMutation.isPending} disabled={!canSend}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default ComposeEmailButton;
