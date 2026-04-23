'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClients } from '@/lib/api-client';
import { formatCurrency, parseDecimal } from '@/lib/format';
import { useProducts } from '@/hooks/use-products';
import { useCpqPrice, useCreateQuote } from '@/hooks/use-quotes';

interface DealRef {
  id: string;
  name: string;
  accountId: string;
  ownerId: string;
  currency: string;
  amount: string;
}

interface DealListResponse {
  data: DealRef[];
}

interface QuoteDraftLine {
  productId: string;
  productName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountPercent: number;
}

export default function NewQuotePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preDealId = searchParams.get('dealId') ?? '';

  const [dealSearch, setDealSearch] = useState('');
  const [selectedDealId, setSelectedDealId] = useState(preDealId);
  const [productSearch, setProductSearch] = useState('');
  const [lineItems, setLineItems] = useState<QuoteDraftLine[]>([]);
  const [paymentTerms, setPaymentTerms] = useState('NET_30');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromos, setAppliedPromos] = useState<string[]>([]);
  const [quoteName, setQuoteName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  const dealsQuery = useQuery<DealListResponse>({
    queryKey: ['quote-builder-deals', dealSearch],
    queryFn: () =>
      apiClients.crm.get<DealListResponse>('/deals', {
        params: { search: dealSearch || undefined, limit: 25, status: 'OPEN' },
      }),
    staleTime: 30_000,
  });

  const productsQuery = useProducts(productSearch);
  const cpqPrice = useCpqPrice();
  const createQuote = useCreateQuote();

  const selectedDeal = useMemo(
    () => (dealsQuery.data?.data ?? []).find((d) => d.id === selectedDealId),
    [dealsQuery.data, selectedDealId]
  );

  const pricingResult = cpqPrice.data;
  const subtotal = lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function addProduct(product: {
    id: string;
    name: string;
    listPrice: string;
  }) {
    setLineItems((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      const list = parseDecimal(product.listPrice);
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          listPrice: list,
          unitPrice: list,
          discountPercent: 0,
        },
      ];
    });
  }

  async function calculatePrice() {
    if (!selectedDeal) return;
    await cpqPrice.mutateAsync({
      tenantId: '',
      dealId: selectedDeal.id,
      accountId: selectedDeal.accountId,
      currency: selectedDeal.currency || 'USD',
      paymentTerms,
      appliedPromos,
      items: lineItems.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        manualOverridePrice:
          line.unitPrice !== line.listPrice ? String(line.unitPrice) : undefined,
      })),
    });
  }

  async function onCreateQuote() {
    if (!selectedDeal) return;
    if (lineItems.length === 0) return;
    const name = quoteName.trim() || `Quote for ${selectedDeal.name}`;
    await createQuote.mutateAsync({
      dealId: selectedDeal.id,
      ownerId: selectedDeal.ownerId,
      accountId: selectedDeal.accountId,
      name,
      currency: selectedDeal.currency || 'USD',
      validUntil: expiryDate ? new Date(expiryDate).toISOString() : undefined,
      notes: quoteNotes || undefined,
      paymentTerms,
      appliedPromos,
      items: lineItems.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        manualOverridePrice:
          line.unitPrice !== line.listPrice ? String(line.unitPrice) : undefined,
      })),
      customFields: {
        pricingPreview: pricingResult ?? null,
      },
    });
    router.push(`/deals/${selectedDeal.id}`);
  }

  return (
    <main className="space-y-5 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">New Quote</h1>
        <p className="text-sm text-slate-600">Build pricing, run CPQ, then create quote.</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Step 1 — Deal selection</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FormField label="Search deals">
            {({ id }) => (
              <Input
                id={id}
                placeholder="Search by name..."
                value={dealSearch}
                onChange={(e) => setDealSearch(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Select deal">
            {({ id }) => (
              <select
                id={id}
                value={selectedDealId}
                onChange={(e) => setSelectedDealId(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">— Select deal —</option>
                {(dealsQuery.data?.data ?? []).map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        {selectedDeal ? (
          <p className="mt-2 text-xs text-slate-600">
            Account: {selectedDeal.accountId.slice(0, 8)}… • Currency: {selectedDeal.currency}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Step 2 — Line items</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            placeholder="Search product..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          <Button type="button" variant="secondary">
            + Add Product
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(productsQuery.data?.data ?? []).slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              {p.name} ({formatCurrency(p.listPrice, p.currency)})
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">List price</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Discount %</th>
                <th className="px-3 py-2 text-right">Line total</th>
                <th className="px-3 py-2 text-right">Remove</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={line.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{line.productName}</td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setLineItems((prev) =>
                          prev.map((l) =>
                            l.productId === line.productId
                              ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                              : l
                          )
                        )
                      }
                      className="ml-auto w-20 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(line.listPrice, selectedDeal?.currency || 'USD')}</td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLineItems((prev) =>
                          prev.map((l) =>
                            l.productId === line.productId
                              ? { ...l, unitPrice: Math.max(0, Number(e.target.value) || 0) }
                              : l
                          )
                        )
                      }
                      className="ml-auto w-28 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.listPrice > 0
                      ? Math.max(
                          0,
                          Math.min(100, ((line.listPrice - line.unitPrice) / line.listPrice) * 100)
                        ).toFixed(1)
                      : '0.0'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(line.quantity * line.unitPrice, selectedDeal?.currency || 'USD')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() =>
                        setLineItems((prev) => prev.filter((l) => l.productId !== line.productId))
                      }
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No line items yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Step 3 — Pricing summary</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <FormField label="Payment terms">
            {({ id }) => (
              <select
                id={id}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="NET_30">NET_30</option>
                <option value="NET_60">NET_60</option>
                <option value="NET_0">NET_0</option>
                <option value="PREPAID">PREPAID</option>
              </select>
            )}
          </FormField>
          <FormField label="Promo code">
            {({ id }) => (
              <Input id={id} value={promoCodeInput} onChange={(e) => setPromoCodeInput(e.target.value)} />
            )}
          </FormField>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const code = promoCodeInput.trim();
                if (!code) return;
                setAppliedPromos((prev) => (prev.includes(code) ? prev : [...prev, code]));
                setPromoCodeInput('');
              }}
            >
              Apply
            </Button>
          </div>
        </div>

        {appliedPromos.length > 0 ? (
          <p className="mt-2 text-xs text-slate-600">Applied promos: {appliedPromos.join(', ')}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={calculatePrice} isLoading={cpqPrice.isPending}>
            Calculate Price
          </Button>
          <span className="text-xs text-slate-500">
            CPQ computes floor warnings, approvals, and full waterfall discounts.
          </span>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm">
          <p>Subtotal: {formatCurrency(pricingResult?.subtotal ?? subtotal, selectedDeal?.currency || 'USD')}</p>
          <p>Discount total: {formatCurrency(pricingResult?.discountTotal ?? 0, selectedDeal?.currency || 'USD')}</p>
          <p>Tax: {formatCurrency(pricingResult?.taxTotal ?? 0, selectedDeal?.currency || 'USD')}</p>
          <p className="font-semibold text-slate-900">
            Grand total: {formatCurrency(pricingResult?.total ?? subtotal, selectedDeal?.currency || 'USD')}
          </p>
        </div>

        {pricingResult?.floorPriceWarnings?.length ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Floor price warnings</p>
            <ul className="mt-1 list-disc pl-5">
              {pricingResult.floorPriceWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {pricingResult?.approvalRequired ? (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            Approval required for this quote before sending.
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Step 4 — Quote details</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FormField label="Quote name">
            {({ id }) => (
              <Input id={id} value={quoteName} onChange={(e) => setQuoteName(e.target.value)} />
            )}
          </FormField>
          <FormField label="Expiry date">
            {({ id }) => (
              <Input id={id} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            )}
          </FormField>
        </div>
        <FormField label="Notes" className="mt-3">
          {({ id }) => (
            <Textarea id={id} rows={3} value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} />
          )}
        </FormField>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            onClick={onCreateQuote}
            isLoading={createQuote.isPending}
            disabled={!selectedDeal || lineItems.length === 0}
          >
            Create Quote
          </Button>
        </div>
      </section>
    </main>
  );
}
