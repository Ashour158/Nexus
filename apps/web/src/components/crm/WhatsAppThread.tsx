'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type WaMessage = {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
  sentBy?: string;
};

export function WhatsAppThread({
  contactId,
  contactPhone,
}: {
  contactId: string;
  contactPhone?: string | null;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) authHeaders.Authorization = `Bearer ${accessToken}`;
  if (tenantId) authHeaders['x-tenant-id'] = tenantId;

  const { data: messages = [] } = useQuery<WaMessage[]>({
    queryKey: ['wa-thread', contactId],
    enabled: Boolean(contactId && accessToken && contactPhone),
    queryFn: async () => {
      const r = await fetch(`/api/comm/whatsapp/thread/${contactId}`, {
        headers: authHeaders,
      });
      const j = (await r.json()) as { success?: boolean; data?: WaMessage[] };
      return j.data ?? [];
    },
    refetchInterval: 15000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      fetch('/api/comm/whatsapp/send', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          to: contactPhone,
          type: 'text',
          text: message,
          contactId,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['wa-thread', contactId] });
      setMessage('');
    },
  });

  if (!accessToken) {
    return (
      <p className="py-4 text-center text-sm text-slate-400">Sign in to use WhatsApp.</p>
    );
  }

  if (!contactPhone) {
    return (
      <p className="py-4 text-center text-sm text-slate-400">
        No phone number on this contact. Add a phone number to enable WhatsApp messaging.
      </p>
    );
  }

  return (
    <div className="flex h-80 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 bg-emerald-500 px-4 py-2 text-sm font-medium text-white">
        <span>💬</span> WhatsApp — {contactPhone}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-950">
        {messages.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">No messages yet</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-3 py-2 text-sm ${
                msg.direction === 'OUTBOUND'
                  ? 'rounded-br-sm bg-emerald-500 text-white'
                  : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <p>{msg.body}</p>
              <p
                className={`mt-1 text-xs ${
                  msg.direction === 'OUTBOUND' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {msg.direction === 'OUTBOUND' && ` · ${msg.status.toLowerCase()}`}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && message.trim())
              sendMutation.mutate();
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => sendMutation.mutate()}
          disabled={!message.trim() || sendMutation.isPending}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
