'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface Product {
  id: string;
  name: string;
  currency: string;
  price: number;
}

export interface LineItem {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

export function ProductLineItems() {
  const [currency, setCurrency] = useState('USD');
  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const { data: productResults } = useQuery({
    queryKey: ['products', 'search', productSearch],
    queryFn: () =>
      fetch(`/api/products?q=${encodeURIComponent(productSearch)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
      }).then((r) => r.json()),
    enabled: productSearch.length > 0,
  });

  const addLineItem = (p: Product) => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        productName: p.name,
        qty: 1,
        unitPrice: Number(p.price ?? 0),
        discount: 0,
      },
    ]);
    setProductSearch('');
  };

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0), [items]);
  const discountTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.qty * i.unitPrice * (i.discount / 100), 0),
    [items]
  );
  const tax = useMemo(() => (subtotal - discountTotal) * 0.14, [subtotal, discountTotal]);
  const total = subtotal - discountTotal + tax;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-900">Product line items</h3>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option>USD</option>
          <option>EUR</option>
          <option>AED</option>
        </select>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <input
          type="text"
          placeholder="Search products..."
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        {productSearch.length > 0 ? (
          <div className="max-h-44 overflow-auto rounded border border-slate-200">
            {(productResults?.products ?? productResults?.data ?? []).map((p: Product) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addLineItem(p)}
                className="w-full px-3 py-2 text-start text-sm hover:bg-gray-50"
              >
                {p.name} - {p.currency} {p.price}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Unit price</th>
              <th className="px-2 py-2">Discount %</th>
              <th className="px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-2 py-2">{item.productName}</td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={item.qty}
                    min={1}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, qty: Number(e.target.value || 1) } : row))
                      )
                    }
                    className="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, unitPrice: Number(e.target.value || 0) } : row
                        )
                      )
                    }
                    className="w-28 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={item.discount}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, discount: Number(e.target.value || 0) } : row
                        )
                      )
                    }
                    className="w-20 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="px-2 py-2">
                  {currency} {(item.qty * item.unitPrice * (1 - item.discount / 100)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded bg-slate-50 p-3 text-sm">
        <p>Subtotal: {currency} {subtotal.toFixed(2)}</p>
        <p>Discount total: {currency} {discountTotal.toFixed(2)}</p>
        <p>Tax: {currency} {tax.toFixed(2)}</p>
        <p className="font-semibold">Total: {currency} {total.toFixed(2)}</p>
      </div>
    </section>
  );
}
