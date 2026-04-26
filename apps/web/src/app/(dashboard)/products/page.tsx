'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Product = { id: string; name: string; sku: string; currency: string; price: number; isActive?: boolean };
type CreateProductInput = { name: string; sku: string; currency: string; price: number };

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateProductInput>({ name: '', sku: '', currency: 'USD', price: 0 });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      const data = await res.json();
      return data as { products?: Product[]; data?: Product[] };
    },
  });

  const createProduct = useMutation({
    mutationFn: async (data: CreateProductInput) => {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error('Failed to create product');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreateModal(false);
      setFormData({ name: '', sku: '', currency: 'USD', price: 0 });
    },
  });

  const products = useMemo(() => productsQuery.data?.products ?? productsQuery.data?.data ?? [], [productsQuery.data]);

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Product Catalog</h1>
        <button className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white" onClick={() => setShowCreateModal(true)}>Create product</button>
      </header>
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody>{products.map((p) => <tr key={p.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{p.name}</td><td className="px-3 py-2">{p.sku}</td><td className="px-3 py-2">{p.currency} {Number(p.price ?? 0).toFixed(2)}</td><td className="px-3 py-2">{p.isActive ?? true ? 'Active' : 'Archived'}</td></tr>)}</tbody>
        </table>
      </section>
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Create product</h2>
            <form onSubmit={(e) => { e.preventDefault(); createProduct.mutate(formData); }} className="space-y-3">
              <input value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="Product name" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
              <input value={formData.sku} onChange={(e) => setFormData((prev) => ({ ...prev, sku: e.target.value }))} placeholder="SKU" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
              <div className="grid grid-cols-2 gap-2">
                <input value={formData.currency} onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} placeholder="USD" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
                <input type="number" step="0.01" min={0} value={formData.price} onChange={(e) => setFormData((prev) => ({ ...prev, price: Number(e.target.value || 0) }))} placeholder="0.00" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" required />
              </div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowCreateModal(false)} className="rounded border border-slate-300 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={createProduct.isPending} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{createProduct.isPending ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
