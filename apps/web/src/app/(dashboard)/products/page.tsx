'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

type Product = {
  id: string;
  name: string;
  nameAr?: string | null;
  sku: string;
  description?: string | null;
  category?: string | null;
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

type ProductFormState = {
  name: string;
  nameAr: string;
  sku: string;
  description: string;
  category: string;
  currency: string;
  listPrice: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductFormState = {
  name: '',
  nameAr: '',
  sku: '',
  description: '',
  category: '',
  currency: 'USD',
  listPrice: '0',
  isActive: true,
};

/** Pulls a product array out of any of the envelope shapes the BFF can return. */
function extractProducts(data: unknown): Product[] {
  if (Array.isArray(data)) return data as Product[];
  const obj = data as Record<string, unknown> | null;
  if (!obj) return [];
  if (Array.isArray(obj.products)) return obj.products as Product[];
  if (Array.isArray(obj.data)) return obj.data as Product[];
  // Paginated backend: { data: { data: [...], pagination } }
  const nested = obj.data as Record<string, unknown> | undefined;
  if (nested && Array.isArray(nested.data)) return nested.data as Product[];
  if (nested && Array.isArray((nested as { items?: unknown[] }).items)) {
    return (nested as { items: unknown[] }).items as Product[];
  }
  return [];
}

export default function ProductsPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'products' | 'kits' | 'vendors'>('products');

  const canCreate = hasPermission('products:create');
  const canUpdate = hasPermission('products:update');
  const canDelete = hasPermission('products:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const authHeaders = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {};

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products', { headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
      return extractProducts(await res.json());
    },
  });

  const kitsQuery = useQuery({
    queryKey: ['product-kits'],
    queryFn: async () => {
      const res = await fetch('/api/finance/product-kits', { headers: authHeaders() });
      const json = await res.json();
      return (json.data ?? []) as ProductKit[];
    },
  });

  const vendorsQuery = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const res = await fetch('/api/finance/vendors', { headers: authHeaders() });
      const json = await res.json();
      return (json.data ?? []) as Vendor[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: { id?: string; body: Record<string, unknown> }) => {
      const url = input.id ? `/api/products/${input.id}` : '/api/products';
      const res = await fetch(url, {
        method: input.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(input.body),
      });
      if (!res.ok) {
        const msg = await res
          .json()
          .then((j) => j?.error?.message ?? j?.error ?? j?.message)
          .catch(() => null);
        throw new Error(typeof msg === 'string' ? msg : `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      closeForm();
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to save product');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleting(null);
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const kits = useMemo(() => kitsQuery.data ?? [], [kitsQuery.data]);
  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name ?? '',
      nameAr: p.nameAr ?? '',
      sku: p.sku ?? '',
      description: p.description ?? '',
      category: p.category ?? '',
      currency: p.currency ?? 'USD',
      listPrice: String(p.listPrice ?? '0'),
      isActive: p.isActive ?? true,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function submitForm() {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Name is required.');
    if (!form.sku.trim()) return setFormError('SKU is required.');
    const price = Number(form.listPrice);
    if (Number.isNaN(price) || price < 0) return setFormError('Price must be a non-negative number.');
    if (form.currency.trim().length !== 3) return setFormError('Currency must be a 3-letter code.');

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || undefined,
      sku: form.sku.trim(),
      description: form.description.trim() || undefined,
      category: form.category.trim() || undefined,
      currency: form.currency.trim().toUpperCase(),
      listPrice: price,
      isActive: form.isActive,
    };
    saveMutation.mutate({ id: editing?.id, body });
  }

  return (
    <main className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Catalog</h1>
        {tab === 'products' && canCreate ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Product
          </Button>
        ) : null}
      </div>
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
          {productsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : productsQuery.isError ? (
            <div className="p-6 text-center text-sm text-red-600">
              Could not load products.{' '}
              <button className="underline" onClick={() => void productsQuery.refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">Name</th>
                  <th className="px-3 py-2 text-start">SKU</th>
                  <th className="px-3 py-2 text-start">Price</th>
                  <th className="px-3 py-2 text-start">Status</th>
                  {canUpdate || canDelete ? <th className="px-3 py-2 text-end">Actions</th> : null}
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
                    <td className="px-3 py-2">{(p.isActive ?? true) ? 'Active' : 'Archived'}</td>
                    {canUpdate || canDelete ? (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate ? (
                            <button
                              onClick={() => openEdit(p)}
                              aria-label={`Edit ${p.name}`}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              onClick={() => setDeleting(p)}
                              aria-label={`Delete ${p.name}`}
                              className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No products yet.{' '}
                      {canCreate ? (
                        <button className="text-blue-600 underline" onClick={openCreate}>
                          Add your first product
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
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

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit Product' : 'New Product'}
        size="lg"
      >
        <div className="space-y-3">
          <FormRow label="Name" required>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Name (Arabic)">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              dir="rtl"
              lang="ar"
              value={form.nameAr}
              onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
            />
          </FormRow>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="SKU" required>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Category">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </FormRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="List price" required>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={form.listPrice}
                onChange={(e) => setForm((f) => ({ ...f, listPrice: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Currency" required>
              <input
                maxLength={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </FormRow>
          </div>
          <FormRow label="Description">
            <textarea
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormRow>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>

          {formError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button onClick={submitForm} isLoading={saveMutation.isPending}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete product"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-medium text-slate-900">{deleting?.name}</span>?
            This action cannot be undone.
          </p>
          {deleteMutation.isError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not delete this product.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
