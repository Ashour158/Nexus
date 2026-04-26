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
        <p className="mt-2 text-slate-600">This link may have expired or been revoked.</p>
      </main>
    );
  }
  const quote = ctx.entityData ?? {};
  const lines = Array.isArray(quote.lineItems) ? (quote.lineItems as Array<Record<string, unknown>>) : [];
  const color = ctx.branding.primaryColor ?? '#3B82F6';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5" style={{ borderTop: `6px solid ${color}` }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{ctx.branding.companyName ?? 'Nexus'}</p>
            <h1 className="text-2xl font-semibold">Quote {String(quote.quoteNumber ?? '')}</h1>
            <p className="text-sm text-slate-600">
              Valid until {formatDate(String(quote.validUntil ?? ''))} · {String(quote.status ?? '')}
            </p>
          </div>
          {ctx.branding.logoUrl ? <img src={ctx.branding.logoUrl} alt="" className="h-12 max-w-40 object-contain" /> : null}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-3 py-2">{String(line.productName ?? line.name ?? 'Line item')}</td>
                <td>{String(line.quantity ?? 1)}</td>
                <td>{formatCurrency(Number(line.unitPrice ?? 0))}</td>
                <td>{formatCurrency(Number(line.total ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Metric label="Subtotal" value={formatCurrency(Number(quote.subtotal ?? 0))} />
        <Metric label="Discount" value={formatCurrency(Number(quote.discountAmount ?? quote.discountTotal ?? 0))} />
        <Metric label="Tax" value={formatCurrency(Number(quote.taxAmount ?? quote.taxTotal ?? 0))} />
        <Metric label="Grand Total" value={formatCurrency(Number(quote.total ?? 0))} />
      </section>

      <section className="flex flex-wrap gap-2">
        <form action={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/accept`} method="post">
          <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Accept Quote</button>
        </form>
        <form action={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/reject`} method="post">
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium">Reject Quote</button>
        </form>
        <Link className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium" href={`${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022'}/portal/${params.token}/download`}>
          Download PDF
        </Link>
      </section>

      {quote.terms ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-900">Terms & Conditions</h2>
          <p className="mt-2 whitespace-pre-wrap">{String(quote.terms)}</p>
        </section>
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
