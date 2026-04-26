'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  category?: string | null;
  type: string;
  listPrice: string | number;
  currency: string;
  isActive: boolean;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const query = useQuery({ queryKey: ['product-detail', id], queryFn: () => apiClients.finance.get<Product>(`/products/${id}`), enabled: Boolean(id) });
  const p = query.data;

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Product {id}</h1>
      {!p ? <p className="text-sm text-slate-500">{query.isLoading ? 'Loading...' : 'Not found.'}</p> : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
            <h2 className="font-semibold">Product info</h2>
            <p>Name: {p.name}</p><p>SKU: {p.sku}</p><p>Category: {p.category ?? '—'}</p><p>Type: {p.type}</p><p>Description: {p.description ?? '—'}</p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
            <h2 className="font-semibold">Pricing</h2>
            <p>List price: {p.currency} {Number(p.listPrice).toFixed(2)}</p>
            <button className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Add to deal</button>
          </section>
        </>
      )}
    </main>
  );
}
