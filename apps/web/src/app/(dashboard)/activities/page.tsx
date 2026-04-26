'use client';

import { useQuery } from '@tanstack/react-query';
import { Calendar, FileText, Mail, MessageSquare, Phone } from 'lucide-react';
import { useState } from 'react';

type Activity = {
  id: string;
  type: string;
  title: string;
  contactName?: string;
  dealName?: string;
  createdAt: string;
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4 text-green-600" />,
  email: <Mail className="h-4 w-4 text-blue-600" />,
  meeting: <Calendar className="h-4 w-4 text-purple-600" />,
  note: <FileText className="h-4 w-4 text-gray-600" />,
  task: <MessageSquare className="h-4 w-4 text-orange-600" />,
};

export default function ActivitiesPage() {
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['activities', filter],
    queryFn: () =>
      fetch(`/api/activities?type=${filter}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
      }).then((r) => r.json()),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1>
        <div className="flex gap-2">
          {['all', 'call', 'email', 'meeting', 'note', 'task'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
                filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.activities ?? []).map((act: Activity) => (
            <div key={act.id} className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mt-0.5 rounded-lg bg-gray-50 p-2">{TYPE_ICONS[act.type] ?? TYPE_ICONS.note}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{act.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {act.contactName ?? 'No contact'} · {act.dealName ? `Deal: ${act.dealName}` : 'No deal'}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">{new Date(act.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {data?.activities?.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">No activities yet</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
