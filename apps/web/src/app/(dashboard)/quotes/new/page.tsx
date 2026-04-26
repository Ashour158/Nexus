'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CurrencySelect } from '@/components/ui/currency-select';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClients } from '@/lib/api-client';
import { formatCurrency, parseDecimal } from '@/lib/format';
import { useProducts } from '@/hooks/use-products';
import { useCpqPrice, useCreateQuote } from '@/hooks/use-quotes';
import { cn } from '@/lib/cn';

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

const STEPS = [
  { id: 0, title: 'Customer', subtitle: 'Select the deal this quote belongs to.' },
  { id: 1, title: 'Products', subtitle: 'Add catalog lines and quantities.' },
  { id: 2, title: 'Pricing', subtitle: 'Run CPQ with payment terms and promos.' },
  { id: 3, title: 'Review', subtitle: 'Name the quote, set validity, and create.' },
] as const;

export default function NewQuotePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preDealId = searchParams.get('dealId') ?? '';

  const [step, setStep] = useState(0);
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
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  const dealsQuery = useQuery<DealListResponse>({
    queryKey: ['quote-builder-deals', dealSearch],
    queryFn: () =>
      apiClients.crm.get<DealListResponse>('/deals', {
        params: { search: dealSearch || undefined, limit: 25, status: 'OPEN' },
      }),
    staleTime: 30_000,
  });

  const productsQuery = useProducts({ search: productSearch, limit: 100 });
  const cpqPrice = useCpqPrice();
  const createQuote = useCreateQuote();

  const selectedDeal = useMemo(
    () => (dealsQuery.data?.data ?? []).find((d) => d.id === selectedDealId),
    [dealsQuery.data, selectedDealId]
  );
  const currency = selectedCurrency;

  useEffect(() => {
    if (selectedDeal?.currency) {
      setSelectedCurrency(selectedDeal.currency);
    }
  }, [selectedDeal?.currency]);

  const pricingResult = cpqPrice.data;
  const subtotal = lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function addProduct(product: { id: string; name: string; listPrice: string }) {
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
      currency: selectedCurrency,
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
    let validUntil: string | undefined;
    if (expiryDate.trim()) {
      const d = new Date(expiryDate + 'T23:59:59.999Z');
      validUntil = d.toISOString();
    }
    const quote = await createQuote.mutateAsync({
      dealId: selectedDeal.id,
      ownerId: selectedDeal.ownerId,
      accountId: selectedDeal.accountId,
      name,
      currency: selectedCurrency,
      validUntil,
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
    router.push(`/quotes/${quote.id}`);
  }

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  const canNextFrom0 = Boolean(selectedDealId);
  const canNextFrom1 = lineItems.length > 0;

  function primaryNext() {
    if (step === 0 && !canNextFrom0) return;
    if (step === 1 && !canNextFrom1) return;
    if (step === 2) {
      void calculatePrice()
        .then(() => next())
        .catch(() => {
          /* CPQ errors surface via global toast */
        });
      return;
    }
    next();
  }

  return (
    <main className="space-y-6 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">New quote</h1>
        <p className="text-sm text-slate-600">
          Four-step builder: customer, products, CPQ pricing, then review and create.
        </p>
      </header>

      <ol className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                step === i
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                  step === i ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-600'
                )}
              >
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span
                  className={cn(
                    'hidden text-xs sm:block',
                    step === i ? 'text-slate-200' : 'text-slate-500'
                  )}
                >
                  {s.subtitle}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Deal</h2>
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
              Account: {selectedDeal.accountId.slice(0, 8)}… • Currency:{' '}
              {selectedCurrency}
            </p>
          ) : null}
          <div className="mt-3 max-w-xs">
            <FormField label="Quote currency">
              {() => (
                <CurrencySelect
                  value={selectedCurrency}
                  onChange={(value) => setSelectedCurrency(value)}
                />
              )}
            </FormField>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              placeholder="Search product..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="md:max-w-md"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(productsQuery.data?.data ?? []).slice(0, 12).map((p) => (
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
                  <th className="px-3 py-2 text-right">List</th>
                  <th className="px-3 py-2 text-right">Unit</th>
                  <th className="px-3 py-2 text-right">Disc %</th>
                  <th className="px-3 py-2 text-right">Line</th>
                  <th className="px-3 py-2 text-right"> </th>
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
                                ? {
                                    ...l,
                                    quantity: Math.max(1, Number(e.target.value) || 1),
                                  }
                                : l
                            )
                          )
                        }
                        className="ml-auto w-20 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(line.listPrice, currency)}
                    </td>
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
                                ? {
                                    ...l,
                                    unitPrice: Math.max(0, Number(e.target.value) || 0),
                                  }
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
                            Math.min(
                              100,
                              ((line.listPrice - line.unitPrice) / line.listPrice) * 100
                            )
                          ).toFixed(1)
                        : '0.0'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(line.quantity * line.unitPrice, currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() =>
                          setLineItems((prev) =>
                            prev.filter((l) => l.productId !== line.productId)
                          )
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
                      Add products from the chips above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">CPQ pricing</h2>
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
                <Input
                  id={id}
                  value={promoCodeInput}
                  onChange={(e) => setPromoCodeInput(e.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const code = promoCodeInput.trim();
                  if (!code) return;
                  setAppliedPromos((prev) =>
                    prev.includes(code) ? prev : [...prev, code]
                  );
                  setPromoCodeInput('');
                }}
              >
                Apply promo
              </Button>
            </div>
          </div>
          {appliedPromos.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              Applied promos: {appliedPromos.join(', ')}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void calculatePrice()}
              isLoading={cpqPrice.isPending}
            >
              Run CPQ
            </Button>
            <span className="text-xs text-slate-500">
              Computes waterfall, floor warnings, and approval flags.
            </span>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm">
            <p>
              Subtotal:{' '}
              {formatCurrency(pricingResult?.subtotal ?? subtotal, currency)}
            </p>
            <p>
              Discount:{' '}
              {formatCurrency(pricingResult?.discountTotal ?? 0, currency)}
            </p>
            <p>Tax: {formatCurrency(pricingResult?.taxTotal ?? 0, currency)}</p>
            <p className="font-semibold text-slate-900">
              Total:{' '}
              {formatCurrency(pricingResult?.total ?? subtotal, currency)}
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
              Approval required before this quote can be sent to the customer.
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Review</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <FormField label="Quote name">
                {({ id }) => (
                  <Input
                    id={id}
                    value={quoteName}
                    onChange={(e) => setQuoteName(e.target.value)}
                    placeholder={selectedDeal ? `Quote for ${selectedDeal.name}` : ''}
                  />
                )}
              </FormField>
              <FormField label="Valid until">
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField label="Notes" className="mt-3">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <strong>Deal:</strong> {selectedDeal?.name ?? '—'}
            </p>
            <p className="mt-1">
              <strong>Lines:</strong> {lineItems.length} ·{' '}
              <strong>Pre-tax total (preview):</strong>{' '}
              {formatCurrency(pricingResult?.total ?? subtotal, currency)}
            </p>
          </div>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <Button type="button" variant="secondary" onClick={back} disabled={step === 0}>
          Back
        </Button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={primaryNext}
              disabled={
                (step === 0 && !canNextFrom0) ||
                (step === 1 && !canNextFrom1) ||
                (step === 2 && (!selectedDeal || lineItems.length === 0))
              }
              isLoading={step === 2 && cpqPrice.isPending}
            >
              {step === 2 ? 'Run CPQ & continue' : 'Next'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void onCreateQuote()}
              isLoading={createQuote.isPending}
              disabled={!selectedDeal || lineItems.length === 0}
            >
              Create quote
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}
