'use client';

import Link from 'next/link';
import { AlertTriangle, Database, Radio, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { ADMIN_GROUPS } from '@/config/admin-registry';

type AdminStats = {
  totalUsers: number;
  activeTenants: number;
  totalDeals: number;
  apiCallsToday: number;
  kafkaQueueDepth: number;
  wsConnections: number;
  recentSignups: Array<{ id: string; name: string; email: string; tenant: string; joined: string }>;
  alerts: Array<{ id: string; timestamp: string; service: string; message: string; severity: 'low' | 'medium' | 'high' }>;
};

export default function AdminHubPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    fetch('/api/admin/stats', {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, [accessToken]);

  const stats = [
    { label: 'Total users', value: data?.totalUsers ?? 0, icon: Users },
    { label: 'Active tenants', value: data?.activeTenants ?? 0, icon: Database },
    { label: 'Total deals', value: data?.totalDeals ?? 0, icon: Database },
    { label: 'API calls today', value: data?.apiCallsToday ?? 0, icon: Radio },
    { label: 'Kafka queue depth', value: data?.kafkaQueueDepth ?? 0, icon: AlertTriangle },
    { label: 'WebSocket connections', value: data?.wsConnections ?? 0, icon: Radio },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Admin Panel</h2>
        <p className="mt-1 text-sm text-gray-400">
          Every administrative and configuration surface, organized in one place.
        </p>
      </div>

      {/* Platform KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-sm">{s.label}</span>
              <s.icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-white">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Grouped feature grid */}
      <div className="space-y-8">
        {ADMIN_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          return (
            <section key={group.id}>
              <div className="mb-3 flex items-center gap-2.5">
                <GroupIcon className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
                  {group.label}
                </h3>
                <span className="text-xs text-gray-500">{group.description}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <Link
                      key={feature.id}
                      href={feature.href}
                      className="group flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-indigo-600 hover:bg-gray-850"
                    >
                      <span className="mt-0.5 rounded-lg bg-gray-800 p-2 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{feature.label}</span>
                          {feature.placeholder ? (
                            <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                              soon
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-400">{feature.description}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Recent activity + alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Recent signups</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
                <tr><th>Name</th><th>Email</th><th>Tenant</th><th>Joined</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(data?.recentSignups ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="py-2">{s.name}</td>
                    <td>{s.email}</td>
                    <td>{s.tenant}</td>
                    <td>{new Date(s.joined).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">System alerts</h3>
          <ul className="space-y-2">
            {(data?.alerts ?? []).map((a) => (
              <li key={a.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.service}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${a.severity === 'high' ? 'bg-red-600' : a.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-700'}`}>{a.severity}</span>
                </div>
                <p className="mt-1 text-gray-300">{a.message}</p>
                <p className="mt-1 text-xs text-gray-500">{new Date(a.timestamp).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
