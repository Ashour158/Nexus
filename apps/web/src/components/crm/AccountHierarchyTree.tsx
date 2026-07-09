'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { ChevronRight, Building2, TrendingUp } from 'lucide-react';

type AccountNode = {
  id: string;
  name: string;
  industry?: string | null;
  _count: { deals: number; contacts: number; children: number };
  children: AccountNode[];
  rollup?: { totalValue: number; dealCount: number };
};

function AccountNodeView({ account, depth = 0 }: { account: AccountNode; depth?: number }) {
  return (
    <div
      className={
        depth > 0 ? 'ms-6 mt-2 border-s-2 border-slate-200 ps-4 dark:border-slate-700' : 'mt-2'
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900">
        <Building2 className="h-4 w-4 flex-shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${account.id}`}
            className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100"
          >
            {account.name}
          </Link>
          {account.industry ? (
            <p className="text-xs text-slate-400">{account.industry}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{account._count.deals} deals</span>
          <span>{account._count.contacts} contacts</span>
          {account.rollup && account.rollup.totalValue > 0 ? (
            <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />$
              {account.rollup.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ) : null}
        </div>
        <Link
          href={`/accounts/${account.id}`}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {account.children?.map((child) => (
        <AccountNodeView key={child.id} account={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function AccountHierarchyTree({ accountId }: { accountId: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const { data, isLoading } = useQuery<AccountNode>({
    queryKey: ['account-hierarchy', accountId, accessToken],
    queryFn: async () => {
      const r = await fetch(`/api/crm/accounts/${accountId}/hierarchy`, {
        headers: authHeaders,
      });
      const d = (await r.json()) as { data?: AccountNode };
      return d.data as AccountNode;
    },
  });

  if (isLoading)
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  if (!data) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">
        Account Group
      </h3>
      <AccountNodeView account={data} />
    </div>
  );
}
