'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useProduct, useUpdateProduct } from '@/hooks/use-products';
import { formatCurrency } from '@/lib/format';
import { notify } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('products:read');
  const query = useProduct(id);
  const updateMutation = useUpdateProduct();
  const p = query.data;

  const [form, setForm] = useState({
    name: '',
    nameAr: '' as string | null,
    description: '' as string | null,
    descriptionAr: '' as string | null,
    unitAr: '' as string | null,
    category: '' as string | null,
  });

  useEffect(() => {
    if (!p) return;
    setForm({
      name: p.name,
      nameAr: p.nameAr ?? '',
      description: p.description ?? '',
      descriptionAr: p.descriptionAr ?? '',
      unitAr: p.unitAr ?? '',
      category: p.category ?? '',
    });
  }, [p]);

  if (!canRead) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-warning/30 bg-warning-container p-4 text-sm text-on-warning-container">
          You do not have permission to view products.
        </div>
      </main>
    );
  }

  if (query.isLoading) {
    return (
      <main className="p-6">
        <TableSkeleton rows={6} cols={3} />
      </main>
    );
  }

  if (!p) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-error/30 bg-error-container p-4 text-sm text-error">
          Product not found.
        </div>
      </main>
    );
  }

  function onSave() {
    updateMutation.mutate(
      {
        id,
        data: {
          name: form.name,
          nameAr: form.nameAr || undefined,
          description: form.description || undefined,
          descriptionAr: form.descriptionAr || undefined,
          unitAr: form.unitAr || undefined,
          category: form.category || undefined,
        },
      },
      {
        onSuccess: () => notify.success('Product saved'),
        onError: (err) => notify.error('Failed to save product', err.message),
      }
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-on-surface-variant">
            <Link href="/products" className="hover:text-on-surface">
              Products
            </Link>
            <span> / </span>
            <span className="font-mono text-xs">{p.sku}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">{p.name}</h1>
          <p className="text-sm text-on-surface-variant">
            {p.category ?? 'Uncategorized'} · {p.currency}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="List Price" value={formatCurrency(Number(p.listPrice), p.currency)} />
        <Metric label="Cost" value={formatCurrency(Number(p.cost ?? 0), p.currency)} />
        <Metric label="SKU" value={p.sku} />
        <Metric label="Status" value={p.isActive ?? true ? 'Active' : 'Archived'} />
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-on-surface">Product details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Name (EN)</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Name (AR)</label>
            <input
              dir="rtl"
              value={form.nameAr ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Description (EN)</label>
            <textarea
              rows={3}
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Description (AR)</label>
            <textarea
              dir="rtl"
              rows={3}
              value={form.descriptionAr ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, descriptionAr: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Category</label>
            <input
              value={form.category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">List Price</label>
            <input
              disabled
              value={`${p.currency} ${Number(p.listPrice).toFixed(2)}`}
              className="w-full rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Unit (AR)</label>
            <input
              dir="rtl"
              value={form.unitAr ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, unitAr: e.target.value }))}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-6">
        <h2 className="text-sm font-semibold text-on-surface">Related records</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs font-medium uppercase text-on-surface-variant">Quotes</p>
            <p className="mt-1 text-sm text-on-surface-variant">Quotes that include this product will be shown here.</p>
          </div>
          <div className="rounded border border-outline-variant bg-surface-container-low p-4">
            <p className="text-xs font-medium uppercase text-on-surface-variant">Invoices</p>
            <p className="mt-1 text-sm text-on-surface-variant">Invoices that include this product will be shown here.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 text-lg font-bold text-on-surface">{value}</p>
    </div>
  );
}
