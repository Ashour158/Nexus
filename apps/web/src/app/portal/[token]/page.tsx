import Image from 'next/image';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/format';

interface PortalContext {
  entityType: string;
  entityData: Record<string, unknown> | null;
  branding: { logoUrl?: string | null; primaryColor?: string; companyName?: string | null };
}

async function getContext(token: string): Promise<PortalContext | null> {
  const base = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022';
  const res = await fetch(`${base}/portal/${token}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: PortalContext };
  return body.data ?? null;
}

export default async function PortalPage({ params }: { params: { token: string } }) {
  const ctx = await getContext(params.token);
  if (!ctx) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Portal link unavailable</h1>
        <p className="mt-2 text-on-surface-variant">This link may have expired or been revoked.</p>
      </main>
    );
  }
  const quote = ctx.entityData ?? {};
  const lines = Array.isArray(quote.lineItems) ? (quote.lineItems as Array<Record<string, unknown>>) : [];
  const color = ctx.branding.primaryColor ?? '#3B82F6';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="rounded-lg border border-outline-variant bg-surface p-5" style={{ borderTop: `6px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-on-surface-variant">{ctx.branding.companyName ?? 'Nexus'}</p>
            <h1 className="text-2xl font-semibold">Quote {String(quote.quoteNumber ?? '')}</h1>
            <p className="text-sm text-on-surface-variant">
              Valid until {formatDate(String(quote.validUntil ?? ''))} · {String(quote.status ?? '')}
            </p>
          </div>
          {ctx.branding.logoUrl ? (
            <Image
              src={ctx.branding.logoUrl}
              alt=""
              width={160}
              height={48}
              unoptimized
              className="h-12 max-w-40 object-contain"
            />
          ) : null}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
            {/*
              Labels are explicit about the basis of each column. The stored
              `unitPrice`/`total` on a quote line are POST-discount (net) values,
              while `quote.subtotal` is the PRE-discount gross. Showing net line
              values under a bare "Unit Price"/"Total" next to a gross
              "Subtotal" made the document look like it did not add up. No stored
              value or calculation is changed here — only what each number is
              called.
            */}
            <tr>
              <th className="px-3 py-2">Product</th>
              <th>Qty</th>
              <th>List price</th>
              <th>Line discount</th>
              <th>Net unit price</th>
              <th>Net line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const pricing = portalLinePricing(line);
              return (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">{String(line.productName ?? line.name ?? 'Line item')}</td>
                  <td>{pricing.quantity}</td>
                  <td>{formatCurrency(pricing.listPrice)}</td>
                  <td>{formatCurrency(pricing.lineDiscount)}</td>
                  <td>{formatCurrency(pricing.netUnitPrice)}</td>
                  <td>{formatCurrency(pricing.netLineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 rounded-lg border border-outline-variant bg-surface p-4 sm:grid-cols-4">
        <Metric label="Gross subtotal (before discount)" value={formatCurrency(Number(quote.subtotal ?? 0))} />
        <Metric label="Line discounts" value={formatCurrency(Number(quote.discountAmount ?? quote.discountTotal ?? 0))} />
        <Metric label="Tax on net" value={formatCurrency(Number(quote.taxAmount ?? quote.taxTotal ?? 0))} />
        <Metric label="Grand total" value={formatCurrency(Number(quote.total ?? 0))} />
      </section>

      <section className="flex flex-wrap gap-2">
        <form action={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/accept`} method="post">
          <button className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white">Accept Quote</button>
        </form>
        <form action={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/reject`} method="post">
          <button className="rounded-md border border-outline-variant px-4 py-2 text-sm font-medium">Reject Quote</button>
        </form>
        <Link className="rounded-md border border-outline-variant px-4 py-2 text-sm font-medium" href={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/download`}>
          Download PDF
        </Link>
      </section>

      {quote.terms ? (
        <section className="rounded-lg border border-outline-variant bg-surface p-4 text-sm text-on-surface-variant">
          <h2 className="font-semibold text-on-surface">Terms & Conditions</h2>
          <p className="mt-2 whitespace-pre-wrap">{String(quote.terms)}</p>
        </section>
      ) : null}
    </main>
  );
}

function finiteAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Presentation-only derivation of the four line columns. Reads whatever the
 * quote payload actually carries and derives the rest; it NEVER recomputes or
 * overrides a stored total — `total` wins whenever it is present.
 */
function portalLinePricing(line: Record<string, unknown>) {
  const quantity = finiteAmount(line.quantity ?? 1);
  const netUnitPrice = finiteAmount(line.unitPrice);
  const discountPct = Math.min(100, Math.max(0, finiteAmount(line.discountPercent)));
  const explicitList = Number(line.listPrice);
  const listPrice = Number.isFinite(explicitList)
    ? explicitList
    : discountPct > 0 && discountPct < 100
      ? netUnitPrice / (1 - discountPct / 100)
      : netUnitPrice;
  const explicitDiscount = Number(line.discountAmount);
  const lineDiscount = Number.isFinite(explicitDiscount)
    ? explicitDiscount
    : Math.max(0, listPrice - netUnitPrice) * quantity;
  const explicitTotal = Number(line.total);
  return {
    quantity,
    listPrice,
    lineDiscount,
    netUnitPrice,
    netLineTotal: Number.isFinite(explicitTotal) ? explicitTotal : netUnitPrice * quantity,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-on-surface-variant">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
