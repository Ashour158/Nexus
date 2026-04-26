interface LineItem {
  name: string;
  description?: string;
  qty: number;
  unitPrice: string;
  discount: string;
  total: string;
}

export interface QuoteData {
  quoteNumber: string;
  name: string;
  validUntil?: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  terms?: string;
  notes?: string;
  lineItems: LineItem[];
  companyName?: string;
  companyLogo?: string;
  contactName?: string;
  contactEmail?: string;
}

function esc(text: string | undefined): string {
  if (!text) return '';
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderQuoteHtml(quote: QuoteData): string {
  const lines = quote.lineItems
    .map(
      (l) => `<tr>
  <td>${esc(l.name)}</td>
  <td>${esc(l.description)}</td>
  <td class="num">${l.qty}</td>
  <td class="num">${esc(l.unitPrice)}</td>
  <td class="num">${esc(l.discount)}</td>
  <td class="num">${esc(l.total)}</td>
</tr>`
    )
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quote ${esc(quote.quoteNumber)}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm; }
    body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; }
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .logo { max-height:56px; }
    .meta { border:1px solid #e2e8f0; border-radius:8px; padding:8px; width:260px; }
    .section { margin-top:16px; }
    table { width:100%; border-collapse:collapse; page-break-inside: avoid; }
    th, td { border:1px solid #e2e8f0; padding:6px; vertical-align:top; }
    th { background:#f8fafc; text-align:left; }
    .num { text-align:right; white-space:nowrap; }
    .summary { width:320px; margin-left:auto; margin-top:10px; }
    .summary td { border: none; padding:4px 0; }
    .summary .total { font-weight:700; border-top:1px solid #cbd5e1; padding-top:8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${quote.companyLogo ? `<img class="logo" src="${esc(quote.companyLogo)}" alt="logo" />` : ''}
      <h2>${esc(quote.companyName ?? 'NEXUS')}</h2>
    </div>
    <div class="meta">
      <div><strong>Quote #:</strong> ${esc(quote.quoteNumber)}</div>
      <div><strong>Date:</strong> ${new Date().toISOString().slice(0, 10)}</div>
      <div><strong>Valid Until:</strong> ${esc(quote.validUntil ?? '-')}</div>
    </div>
  </div>
  <div class="section">
    <h3>Bill To</h3>
    <div>${esc(quote.contactName ?? '-')}</div>
    <div>${esc(quote.contactEmail ?? '-')}</div>
  </div>
  <div class="section">
    <h3>${esc(quote.name)}</h3>
    <table>
      <thead>
        <tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr>
      </thead>
      <tbody>
        ${lines}
      </tbody>
    </table>
    <table class="summary">
      <tr><td>Subtotal</td><td class="num">${esc(quote.subtotal)}</td></tr>
      <tr><td>Discount</td><td class="num">${esc(quote.discountAmount)}</td></tr>
      <tr><td>Tax</td><td class="num">${esc(quote.taxAmount)}</td></tr>
      <tr class="total"><td>Total</td><td class="num">${esc(quote.total)}</td></tr>
    </table>
  </div>
  <div class="section">
    <h3>Terms & Conditions</h3>
    <div>${esc(quote.terms ?? '')}</div>
    <h4>Notes</h4>
    <div>${esc(quote.notes ?? '')}</div>
  </div>
</body>
</html>`;
}
