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
      .then(async (r) => (await r.json()) as { data?: ErasureRequest[] | { rows?: ErasureRequest[] } })
      .then((d) => {
        // Live API returns { data: { rows, total, ... } }; tolerate a bare array.
        setRequests(Array.isArray(d.data) ? d.data : d.data?.rows ?? []);
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
    PENDING: 'bg-warning-container text-warning',
    PROCESSING: 'bg-primary-container text-primary',
    COMPLETED: 'bg-success-container text-success',
    FAILED: 'bg-error-container text-error',
  };

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-2 text-xl font-bold text-on-surface ">GDPR Data Erasure</h1>
      <p className="mb-6 text-sm text-on-surface-variant dark:text-on-surface-variant">
        Submit a right-to-erasure request across all NEXUS services.
      </p>

      {submitted ? (
        <div className="mb-4 rounded-xl border border-success/30 bg-success-container p-4 ">
          <p className="text-sm text-success dark:text-success">
            Request submitted. Reference ID: <code className="font-mono">{submitted}</code>
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-outline-variant bg-surface p-5 dark:border-outline-variant dark:bg-surface">
        <h2 className="mb-4 font-semibold text-on-surface dark:text-outline">New Erasure Request</h2>
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-on-surface-variant">Subject Email *</label>
            <input
              type="email"
              required
              placeholder="john.doe@example.com"
              className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm dark:border-outline dark:bg-surface-container-high "
              value={form.subjectEmail}
              onChange={(e) => setForm((f) => ({ ...f, subjectEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-on-surface-variant">Requested By *</label>
            <input
              required
              placeholder="DPO name or reference"
              className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm dark:border-outline dark:bg-surface-container-high "
              value={form.requestedBy}
              onChange={(e) => setForm((f) => ({ ...f, requestedBy: e.target.value }))}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Erasure Request'}
        </button>
      </form>

      <h2 className="mb-3 font-semibold text-on-surface dark:text-outline">Request History</h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-container-high dark:bg-surface-container-high" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="py-4 text-sm text-on-surface-variant">No erasure requests submitted yet</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface dark:border-outline-variant dark:bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant bg-surface-container-low dark:border-outline-variant dark:bg-surface-container-high">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Subject</th>
                <th className="px-4 py-3 text-start font-medium text-on-surface-variant">Requested By</th>
                <th className="px-4 py-3 text-center font-medium text-on-surface-variant">Status</th>
                <th className="px-4 py-3 text-end font-medium text-on-surface-variant">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant ">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-surface-container-low dark:hover:bg-surface-container-highest">
                  <td className="px-4 py-3 text-on-surface dark:text-outline">{r.subjectEmail || r.subjectId}</td>
                  <td className="px-4 py-3 text-on-surface-variant dark:text-on-surface-variant">{r.requestedBy}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] || 'bg-surface-container-high text-on-surface-variant'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-on-surface-variant">
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
