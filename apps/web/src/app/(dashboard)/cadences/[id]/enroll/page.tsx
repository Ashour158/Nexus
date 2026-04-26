'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';

export default function EnrollPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');

  const enroll = useMutation({
    mutationFn: async (contactEmails: string[]) => {
      const res = await fetch(`/api/cadences/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: contactEmails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Failed to enroll contacts');
      }
      return data as { count?: number };
    },
    onSuccess: (data) => {
      router.push(`/cadences/${id}?enrolled=${data.count ?? 0}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const list = emails
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (list.length === 0) {
      setError('Enter at least one email address');
      return;
    }

    enroll.mutate(list);
  };

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Enroll contacts in cadence</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Email addresses (one per line or comma-separated)
          </label>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="john@acme.com&#10;jane@corp.com"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={enroll.isPending}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {enroll.isPending ? 'Enrolling...' : 'Enroll contacts'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
