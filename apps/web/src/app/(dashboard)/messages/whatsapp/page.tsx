'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Phone, Search, Send } from 'lucide-react';
import type { Contact } from '@nexus/shared-types';
import { useAuthStore } from '@/stores/auth.store';

interface ThreadMsg {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  sentAt: string;
}

function contactDisplayName(c: Pick<Contact, 'firstName' | 'lastName'>) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact';
}

function phoneOf(c: Contact) {
  return (c.mobile ?? c.phone ?? '').trim();
}

function useHeaders() {
  const token = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-tenant-id': tenantId ?? 'default',
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

function mapThreadMessages(raw: unknown[]): ThreadMsg[] {
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const dir = String(r.direction ?? '').toUpperCase();
    const outbound = dir === 'OUTBOUND';
    const created = r.createdAt ?? r.sentAt;
    return {
      id: String(r.id ?? ''),
      direction: outbound ? 'outbound' : 'inbound',
      body: String(r.body ?? ''),
      status: String(r.status ?? 'sent').toLowerCase(),
      sentAt: typeof created === 'string' ? created : new Date().toISOString(),
    };
  });
}

export default function WhatsAppInboxPage(): JSX.Element {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const headers = useHeaders();
  const qc = useQueryClient();

  const contactsQuery = useQuery({
    queryKey: ['whatsapp-contacts'],
    queryFn: async () => {
      const res = await fetch('/api/contacts?page=1&limit=100', { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load contacts');
      const envelope = json.data as { data?: Contact[] } | Contact[] | undefined;
      const rows = Array.isArray(envelope) ? envelope : (envelope?.data ?? []);
      return rows.filter((c) => phoneOf(c));
    },
  });

  const threadQuery = useQuery({
    queryKey: ['whatsapp-thread', selectedContactId],
    queryFn: async () => {
      const res = await fetch(`/api/comm/whatsapp/thread/${selectedContactId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error('Thread failed');
      const data = (json.data ?? json) as unknown[];
      return mapThreadMessages(Array.isArray(data) ? data : []);
    },
    enabled: Boolean(selectedContactId),
    refetchInterval: 15_000,
  });

  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      const contact = contactsQuery.data?.find((c) => c.id === selectedContactId);
      if (!contact) throw new Error('No contact selected');
      const to = phoneOf(contact);
      if (!to) throw new Error('Contact has no phone');
      const res = await fetch('/api/comm/whatsapp/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to,
          type: 'text',
          text,
          contactId: contact.id,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['whatsapp-thread', selectedContactId] });
    },
  });

  const contacts = (contactsQuery.data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = contactDisplayName(c).toLowerCase();
    return name.includes(q) || phoneOf(c).includes(search);
  });

  const selected = contacts.find((c) => c.id === selectedContactId);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-outline-variant bg-surface">
      <div className="flex w-80 flex-col border-e border-outline-variant">
        <div className="border-b border-outline-variant p-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare className="h-5 w-5 text-success" />
            WhatsApp
          </h1>
          <div className="relative mt-3">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-on-surface-variant" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full rounded-lg border border-outline-variant px-3 py-2 ps-9 text-sm focus:outline-none focus:ring-2 focus:ring-success"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {contactsQuery.isLoading ? (
            <div className="p-4 text-sm text-on-surface-variant">Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">No contacts with phone numbers</div>
          ) : (
            contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContactId(c.id)}
                className={`w-full border-b border-outline-variant px-4 py-3 text-start transition-colors hover:bg-surface-container-low ${
                  selectedContactId === c.id ? 'border-e-2 border-e-green-500 bg-success-container' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-container text-sm font-semibold text-success">
                    {contactDisplayName(c)[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-on-surface">{contactDisplayName(c)}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-on-surface-variant">
                      <Phone className="h-3 w-3" />
                      {phoneOf(c)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {!selectedContactId ? (
          <div className="flex flex-1 items-center justify-center text-on-surface-variant">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="text-sm">Select a contact to start a conversation</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-outline-variant bg-surface px-5 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success-container text-sm font-semibold text-success">
                {selected ? contactDisplayName(selected)[0]?.toUpperCase() : '?'}
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">
                  {selected ? contactDisplayName(selected) : ''}
                </p>
                <p className="text-xs text-on-surface-variant">{selected ? phoneOf(selected) : ''}</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-surface-container-low p-5">
              {threadQuery.isLoading ? (
                <div className="py-8 text-center text-sm text-on-surface-variant">Loading messages…</div>
              ) : (threadQuery.data ?? []).length === 0 ? (
                <div className="py-8 text-center text-sm text-on-surface-variant">No messages yet. Send the first one!</div>
              ) : (
                (threadQuery.data ?? []).map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xs rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        msg.direction === 'outbound'
                          ? 'rounded-br-sm bg-success text-white'
                          : 'rounded-bl-sm border border-outline-variant bg-surface text-on-surface'
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p
                        className={`mt-1 text-xs ${msg.direction === 'outbound' ? 'text-on-success-container' : 'text-on-surface-variant'}`}
                      >
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.direction === 'outbound' && (
                          <span className="ms-1">{msg.status === 'delivered' || msg.status === 'read' ? '✓✓' : '✓'}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-outline-variant bg-surface p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) sendMessage.mutate(draft.trim());
                }}
                className="flex gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 rounded-full border border-outline-variant px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-success"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sendMessage.isPending}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white transition-colors hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
