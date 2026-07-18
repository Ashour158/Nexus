'use client';

/**
 * Universal annotations & data-linking panel.
 *
 * Drop this on ANY surface — a report, a dashboard, a deal, an account — to give
 * it a threaded comment feed plus a "linked data" list that connects it to any
 * other record in the system. Backed by reporting-service's polymorphic
 * annotation + data-link API (proxied at /api/reporting/*).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Annotation {
  id: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  pinned: boolean;
  resolved: boolean;
  createdAt: string;
  replies?: Annotation[];
}
interface DataLink {
  id: string;
  relation: string;
  label?: string | null;
  note?: string | null;
  direction: 'outgoing' | 'incoming';
  otherType: string;
  otherId: string;
  createdAt: string;
}

const LINKABLE_TYPES = [
  'deal', 'account', 'contact', 'lead', 'quote', 'order', 'invoice', 'ticket',
  'campaign', 'activity', 'report', 'dashboard', 'user',
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AnnotationsPanel({
  targetType,
  targetId,
  targetLabel,
}: {
  targetType: string;
  targetId: string;
  targetLabel?: string;
}): JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<'comments' | 'links'>('comments');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [links, setLinks] = useState<DataLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  // link form
  const [linkType, setLinkType] = useState('deal');
  const [linkId, setLinkId] = useState('');
  const [linkRelation, setLinkRelation] = useState('related');

  const headers = useMemo(
    (): Record<string, string> => ({
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    [accessToken],
  );

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const [aRes, lRes] = await Promise.all([
        fetch(
          `/api/reporting/annotations?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}&includeResolved=${showResolved}`,
          { headers },
        ),
        fetch(`/api/reporting/links?type=${encodeURIComponent(targetType)}&id=${encodeURIComponent(targetId)}`, { headers }),
      ]);
      const aJson = await aRes.json().catch(() => ({}));
      const lJson = await lRes.json().catch(() => ({}));
      setAnnotations(Array.isArray(aJson.data) ? aJson.data : []);
      setLinks(Array.isArray(lJson.data) ? lJson.data : []);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, showResolved, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      await fetch('/api/reporting/annotations', { method: 'POST', headers, body: JSON.stringify(body) });
      await load();
    },
    [headers, load],
  );

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await fetch(`/api/reporting/annotations/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
      await load();
    },
    [headers, load],
  );

  const del = useCallback(
    async (id: string) => {
      await fetch(`/api/reporting/annotations/${id}`, { method: 'DELETE', headers });
      await load();
    },
    [headers, load],
  );

  const addComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await post({ targetType, targetId, body });
  };
  const addReply = async (parentId: string) => {
    const body = replyText.trim();
    if (!body) return;
    setReplyText('');
    setReplyTo(null);
    await post({ targetType, targetId, parentId, body });
  };

  const addLink = async () => {
    const id = linkId.trim();
    if (!id) return;
    setLinkId('');
    await fetch('/api/reporting/links', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fromType: targetType, fromId: targetId, toType: linkType, toId: id, relation: linkRelation }),
    });
    await load();
  };
  const removeLink = async (id: string) => {
    await fetch(`/api/reporting/links/${id}`, { method: 'DELETE', headers });
    await load();
  };

  const openCount = annotations.filter((a) => !a.resolved).length;

  const renderNote = (a: Annotation, isReply = false) => (
    <div key={a.id} className={isReply ? 'ml-6 mt-2 border-l-2 border-outline-variant pl-3' : ''}>
      <div className="rounded-md bg-surface-container p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-on-surface">
            {a.authorName ?? 'User'} {a.pinned ? <span title="Pinned">📌</span> : null}
          </span>
          <span className="text-[11px] text-on-surface-variant">{timeAgo(a.createdAt)}</span>
        </div>
        <p className={`mt-1 whitespace-pre-wrap text-sm ${a.resolved ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
          {a.body}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-primary">
          {!isReply ? (
            <button type="button" className="hover:underline" onClick={() => setReplyTo(replyTo === a.id ? null : a.id)}>
              Reply
            </button>
          ) : null}
          <button type="button" className="hover:underline" onClick={() => patch(a.id, { pinned: !a.pinned })}>
            {a.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button type="button" className="hover:underline" onClick={() => patch(a.id, { resolved: !a.resolved })}>
            {a.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button type="button" className="text-error hover:underline" onClick={() => del(a.id)}>
            Delete
          </button>
        </div>
      </div>
      {replyTo === a.id ? (
        <div className="ml-6 mt-2 flex gap-2">
          <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply…" />
          <Button type="button" onClick={() => addReply(a.id)}>Reply</Button>
        </div>
      ) : null}
      {a.replies?.map((r) => renderNote(r, true))}
    </div>
  );

  return (
    <section className="rounded-lg border border-outline-variant bg-surface">
      <header className="flex items-center gap-1 border-b border-outline-variant px-3 pt-2">
        <button
          type="button"
          onClick={() => setTab('comments')}
          className={`px-2 py-1.5 text-sm font-medium ${tab === 'comments' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
        >
          Comments {openCount > 0 ? <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{openCount}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => setTab('links')}
          className={`px-2 py-1.5 text-sm font-medium ${tab === 'links' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}
        >
          Linked data {links.length > 0 ? <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{links.length}</span> : null}
        </button>
      </header>

      <div className="p-3">
        {tab === 'comments' ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Comment on ${targetLabel ?? targetType}…`} onKeyDown={(e) => { if (e.key === 'Enter') void addComment(); }} />
              <Button type="button" onClick={addComment} disabled={!draft.trim()}>Post</Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
            </label>
            {loading ? (
              <p className="text-sm text-on-surface-variant">Loading…</p>
            ) : annotations.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No comments yet. Start the discussion.</p>
            ) : (
              <div className="space-y-2">{annotations.map((a) => renderNote(a))}</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-on-surface-variant">
                Type
                <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="mt-0.5 block rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-sm">
                  {LINKABLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <Input value={linkId} onChange={(e) => setLinkId(e.target.value)} placeholder="record id" className="w-40" />
              <Input value={linkRelation} onChange={(e) => setLinkRelation(e.target.value)} placeholder="relation (e.g. explains)" className="w-40" />
              <Button type="button" onClick={addLink} disabled={!linkId.trim()}>Link</Button>
            </div>
            {links.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No linked records. Connect this to any deal, account, report…</p>
            ) : (
              <ul className="space-y-1.5">
                {links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-container p-2 text-sm">
                    <span className="text-on-surface">
                      <span className="text-on-surface-variant">{l.direction === 'outgoing' ? '→' : '←'} {l.relation}</span>{' '}
                      <span className="font-medium">{l.otherType}</span>
                      <span className="ml-1 font-mono text-xs text-on-surface-variant">{l.otherId.slice(0, 12)}</span>
                      {l.label ? <span className="ml-1 text-on-surface-variant">· {l.label}</span> : null}
                    </span>
                    <button type="button" className="text-xs text-error hover:underline" onClick={() => removeLink(l.id)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
