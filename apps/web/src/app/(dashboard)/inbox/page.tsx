'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Inbox, Mail, Paperclip, RefreshCw, Search, Send, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

interface Thread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  sentAt: string;
  isRead: boolean;
  messageCount: number;
  dealId?: string;
  contactId?: string;
}

interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  sentAt: string;
  isInbound: boolean;
}

export default function InboxPage() {
  const userId = useAuthStore((s) => s.userId);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const qc = useQueryClient();

  const { data: connection } = useQuery({
    queryKey: ['email-connection', userId],
    queryFn: async () => {
      const res = await fetch('/api/email/connection');
      return res.json();
    },
  });

  const { data: threads = [], isLoading, refetch } = useQuery<Thread[]>({
    queryKey: ['inbox', userId, searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/email/inbox?q=${encodeURIComponent(searchQuery)}`);
      return res.json();
    },
    enabled: Boolean(connection?.connected),
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['thread', selectedThread?.id],
    queryFn: async () => {
      const res = await fetch(`/api/email/threads/${selectedThread?.id}`);
      return res.json();
    },
    enabled: Boolean(selectedThread),
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { threadId: string; body: string; to: string; subject: string }) =>
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      setReplyBody('');
      void qc.invalidateQueries({ queryKey: ['thread', selectedThread?.id] });
      void qc.invalidateQueries({ queryKey: ['inbox', userId] });
    },
  });

  if (!connection?.connected) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <Mail className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Connect Your Email</h2>
          <p className="max-w-md text-gray-500">Connect Gmail or Outlook to read and reply to emails without leaving NEXUS.</p>
        </div>
        <div className="flex gap-3">
          <a href="/api/email/oauth/gmail/init" className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Connect Gmail</a>
          <button disabled className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-5 py-2.5 text-sm font-medium text-gray-500">Outlook (soon)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className={`flex flex-col border-e border-gray-200 ${selectedThread ? 'hidden w-80 md:flex' : 'w-full md:w-80'}`}>
        <div className="flex items-center gap-2 border-b border-gray-200 p-3">
          <div className="relative flex-1">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search emails..." className="w-full rounded-lg border border-gray-200 py-2 ps-8 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => void refetch()} className="rounded-lg p-2 hover:bg-gray-100" title="Refresh" aria-label="Refresh inbox"><RefreshCw className="h-4 w-4 text-gray-500" /></button>
          <button onClick={() => setShowCompose(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Compose</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? <div className="p-4 text-sm text-gray-500">Loading emails...</div> : null}
          {!isLoading && threads.length === 0 ? <div className="p-8 text-center text-sm text-gray-400">No emails found</div> : null}
          {threads.map((thread) => (
            <button key={thread.id} onClick={() => setSelectedThread(thread)} className={`w-full border-b border-gray-100 p-3 text-start transition-colors hover:bg-blue-50/40 ${selectedThread?.id === thread.id ? 'bg-blue-50' : ''}`}>
              <div className="mb-0.5 flex items-start justify-between gap-2">
                <span className={`truncate text-sm ${!thread.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{thread.from.split('<')[0].trim()}</span>
                <span className="shrink-0 text-xs text-gray-400">{new Date(thread.sentAt).toLocaleDateString()}</span>
              </div>
              <div className={`mb-0.5 truncate text-sm ${!thread.isRead ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{thread.subject}</div>
              <div className="truncate text-xs text-gray-400">{thread.snippet}</div>
            </button>
          ))}
        </div>
      </div>

      {selectedThread ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-gray-200 p-4">
            <button onClick={() => setSelectedThread(null)} className="rounded-lg p-1.5 hover:bg-gray-100 md:hidden" aria-label="Back to inbox"><ChevronLeft className="h-4 w-4" /></button>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">{selectedThread.subject}</h2>
              <p className="text-sm text-gray-500">{selectedThread.messageCount} messages</p>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isInbound ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-xl p-4 ${msg.isInbound ? 'bg-gray-100 text-gray-900' : 'bg-blue-600 text-white'}`}>
                  <div className={`mb-2 text-xs ${msg.isInbound ? 'text-gray-500' : 'text-blue-100'}`}>{msg.isInbound ? msg.from : 'You'} · {new Date(msg.sentAt).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: msg.body }} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-4">
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write your reply..." rows={4} className="w-full resize-none p-3 text-sm focus:outline-none" />
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2">
                <button className="rounded p-1.5 hover:bg-gray-200" title="Attach file" aria-label="Attach file"><Paperclip className="h-4 w-4 text-gray-500" /></button>
                <button onClick={() => {
                  if (!selectedThread || !replyBody.trim()) return;
                  sendMutation.mutate({ threadId: selectedThread.id, to: selectedThread.from, subject: `Re: ${selectedThread.subject}`, body: replyBody });
                }} disabled={!replyBody.trim() || sendMutation.isPending} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{sendMutation.isPending ? 'Sending...' : 'Send'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center text-gray-400 md:flex"><div className="text-center"><Inbox className="mx-auto mb-3 h-12 w-12 opacity-30" /><p className="text-sm">Select a thread to read</p></div></div>
      )}

      {showCompose ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-4">
          <div className="pointer-events-auto w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gray-800 px-4 py-3"><span className="text-sm font-medium text-white">New Email</span><button onClick={() => setShowCompose(false)} className="rounded p-1 hover:bg-gray-700" aria-label="Close compose"><X className="h-4 w-4 text-gray-400" /></button></div>
            <div className="space-y-3 p-4">
              <input placeholder="To" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <input placeholder="Subject" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <textarea placeholder="Message" rows={8} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2"><button onClick={() => setShowCompose(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Discard</button><button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Send className="h-3.5 w-3.5" />Send</button></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
