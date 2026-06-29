'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

type Product = {
  id: string;
  name: string;
  nameAr?: string | null;
  sku: string;
  currency: string;
  listPrice: string | number;
  isActive?: boolean;
};

type ProductKit = {
  id: string;
  name: string;
  sku?: string;
  currency: string;
  listPrice: string | number;
  items?: unknown[];
};

type Vendor = {
  id: string;
  name: string;
  code?: string;
  currency: string;
  isActive: boolean;
  products?: unknown[];
};

export default function ProductsPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<'products' | 'kits' | 'vendors'>('products');

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return (data.products ?? data.data ?? []) as Product[];
    },
  });

  const kitsQuery = useQuery({
    queryKey: ['product-kits'],
    queryFn: async () => {
      const res = await fetch('/api/finance/product-kits', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as ProductKit[];
    },
  });

  const vendorsQuery = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const res = await fetch('/api/finance/vendors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as Vendor[];
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const kits = useMemo(() => kitsQuery.data ?? [], [kitsQuery.data]);
  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Catalog</h1>
      <div className="flex gap-2">
        {(['products', 'kits', 'vendors'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === key ? 'bg-blue-600 text-white' : 'bg-gray-100'
            }`}
          >
            {key === 'products' ? 'Products' : key === 'kits' ? 'Kits' : 'Vendors'}
          </button>
        ))}
      </div>

      {tab === 'products' ? (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div>
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.nameAr ? (
                        <span className="mt-0.5 block text-xs text-slate-500" dir="rtl" lang="ar">
                          {p.nameAr}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.sku}</td>
                  <td className="px-3 py-2">
                    {p.currency} {Number(p.listPrice ?? 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    {p.isActive ?? true ? 'Active' : 'Archived'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === 'kits' ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <ul>
            {kits.map((k) => (
              <li key={k.id} className="border-t px-4 py-3 first:border-t-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{k.name}</span>
                  <span className="text-xs text-slate-500">{k.currency} {Number(k.listPrice ?? 0).toFixed(2)} · {(k.items as unknown[])?.length ?? 0} items</span>
                </div>
              </li>
            ))}
            {kits.length === 0 ? <li className="px-4 py-6 text-center text-sm text-slate-500">No product kits found.</li> : null}
          </ul>
        </section>
      ) : null}

      {tab === 'vendors' ? (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{vendor.name}</td>
                  <td className="px-3 py-2">{vendor.code ?? '-'}</td>
                  <td className="px-3 py-2">{vendor.currency}</td>
                  <td className="px-3 py-2">{vendor.products?.length ?? 0}</td>
                  <td className="px-3 py-2">{vendor.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No vendors found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
