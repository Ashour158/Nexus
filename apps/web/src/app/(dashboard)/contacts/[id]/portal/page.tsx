'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye, Link2, Send } from 'lucide-react';

export default function ContactPortalPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ['contact-portal', id],
    queryFn: () => fetch(`/api/contacts/${id}/portal`).then((r) => r.json()),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch(`/api/contacts/${id}/portal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-portal', id] }),
  });

  const portalUrl = `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portal.nexuscrm.io'}/c/${data?.token ?? ''}`;

  const copy = async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Customer Portal Access</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{data?.enabled ? 'Enabled' : 'Disabled'}</span>
          <button
            type="button"
            onClick={() => toggle.mutate(!data?.enabled)}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${data?.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <span className={`mt-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${data?.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {data?.enabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="flex-1 truncate text-sm text-gray-600">{portalUrl}</span>
            <button type="button" onClick={copy} className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex gap-3">
            <button type="button" className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Send className="h-4 w-4" /> Send invite email
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" /> Preview portal
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
