'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';

interface DealEmailThreadProps {
  dealId: string;
}

interface ThreadItem {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  sentAt: string;
}

export default function DealEmailThread({ dealId }: DealEmailThreadProps) {
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: threads = [], isLoading } = useQuery<ThreadItem[]>({
    queryKey: ['deal-email-thread', dealId],
    queryFn: () => fetch(`/api/email/inbox?dealId=${encodeURIComponent(dealId)}`).then((r) => r.json()),
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { threadId: string; body: string; to: string; subject: string }) =>
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deal-email-thread', dealId] });
      setReplyByThread({});
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading deal emails...</p>;

  return (
    <section className="space-y-4">
      {threads.length === 0 ? <p className="text-sm text-slate-500">No emails linked to this deal yet.</p> : null}
      {threads.map((thread) => (
        <article key={thread.id} className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{thread.subject}</h3>
            <span className="text-xs text-slate-400">{new Date(thread.sentAt).toLocaleString()}</span>
          </div>
          <p className="text-xs text-slate-500">From: {thread.from}</p>
          <p className="mt-2 text-sm text-slate-700">{thread.snippet}</p>
          <div className="mt-3 space-y-2">
            <textarea
              value={replyByThread[thread.id] ?? ''}
              onChange={(e) => setReplyByThread((prev) => ({ ...prev, [thread.id]: e.target.value }))}
              rows={3}
              placeholder="Reply inline..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                onClick={() => {
                  const body = (replyByThread[thread.id] ?? '').trim();
                  if (!body) return;
                  sendMutation.mutate({ threadId: thread.id, to: thread.from, subject: `Re: ${thread.subject}`, body });
                }}
                disabled={sendMutation.isPending || !(replyByThread[thread.id] ?? '').trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Send reply
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
