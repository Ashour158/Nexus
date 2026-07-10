'use client';

import { useEffect, useState } from 'react';

interface ErasureRequest {
  id: string;
  subjectEmail?: string;
  subjectId?: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
}

export default function GdprPage() {
  const [requests, setRequests] = useState<ErasureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ subjectEmail: '', requestedBy: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const fetchRequests = () =>
    fetch('/api/auth/gdpr/erasure')
      .then(async (r) => (await r.json()) as { data?: ErasureRequest[] })
      .then((d) => {
        setRequests(d.data || []);
        setLoading(false);
      });

  useEffect(() => {
    void fetchRequests();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/auth/gdpr/erasure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { requestId?: string };
    setSubmitted(data.requestId ?? null);
    setForm({ subjectEmail: '', requestedBy: '' });
    setSubmitting(false);
    void fetchRequests();
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    PROCESSING: 'bg-indigo-100 text-indigo-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-gray-100">GDPR Data Erasure</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Submit a right-to-erasure request across all NEXUS services.
      </p>

      {submitted ? (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-400">
            Request submitted. Reference ID: <code className="font-mono">{submitted}</code>
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 font-semibold text-gray-800 dark:text-gray-200">New Erasure Request</h2>
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Subject Email *</label>
            <input
              type="email"
              required
              placeholder="john.doe@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.subjectEmail}
              onChange={(e) => setForm((f) => ({ ...f, subjectEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Requested By *</label>
            <input
              required
              placeholder="DPO name or reference"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.requestedBy}
              onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Erasure Request'}
        </button>
      </form>

      <h2 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Request History</h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="py-4 text-sm text-gray-400">No erasure requests submitted yet</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-gray-500">Subject</th>
                <th className="px-4 py-3 text-start font-medium text-gray-500">Requested By</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-end font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.subjectEmail || r.subjectId}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.requestedBy}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
