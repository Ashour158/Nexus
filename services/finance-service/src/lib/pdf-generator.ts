import puppeteer from 'puppeteer-core';

// Flags for the system Chromium the image ships (Alpine `chromium`, at
// CHROMIUM_PATH=/usr/bin/chromium-browser). The previous config used
// @sparticuz/chromium's AWS-Lambda-tuned args against that Alpine binary, which
// crashed the browser on launch (`TargetCloseError: Target closed`). These are the
// standard containerized-Chromium flags: no sandbox (we run unprivileged), and no
// reliance on /dev/shm (tiny in containers) so the tab process doesn't get killed.
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--font-render-hinting=none',
];

export async function generatePDF(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: CHROMIUM_ARGS,
    defaultViewport: null,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export function buildInvoiceHTML(invoice: {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  vendor: { name: string; address: string; trn?: string; email?: string; phone?: string };
  buyer: { name: string; address: string; trn?: string; email?: string };
  lineItems: { description: string; qty: number; unitPrice: number; total: number; taxRate?: number; taxAmount?: number }[];
  subtotal: number;
  taxBreakdown: { taxName: string; rate: number; amount: number }[];
  totalTax: number;
  grandTotal: number;
  notes?: string;
  paymentTerms?: string;
  /** French invoice compliance — rendered when `siret` is present. */
  siret?: string;
  apeCode?: string;
  capitalSocial?: string;
  rcs?: string;
  legalForm?: string;
  vatNumber?: string;
  paymentTermsText?: string;
  latePaymentPenalty?: string;
}): string {
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n);

  const lineItemRows = invoice.lineItems
    .map(
      (item) => `
    <tr>
      <td class="desc">${item.description}</td>
      <td class="num">${item.qty}</td>
      <td class="num">${fmt(item.unitPrice)}</td>
      <td class="num">${item.taxRate ? `${item.taxRate}%` : '—'}</td>
      <td class="num">${item.taxAmount ? fmt(item.taxAmount) : '—'}</td>
      <td class="num bold">${fmt(item.total)}</td>
    </tr>
  `
    )
    .join('');

  const frenchLegalHtml = invoice.siret
    ? `
  <div style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #6b7280;">
    <p><strong>Mentions légales obligatoires :</strong></p>
    ${invoice.siret ? `<p>SIRET : ${invoice.siret}${invoice.apeCode ? ` | APE : ${invoice.apeCode}` : ''}</p>` : ''}
    ${invoice.rcs ? `<p>RCS ${invoice.rcs}${invoice.legalForm ? ` | Forme juridique : ${invoice.legalForm}` : ''}</p>` : ''}
    ${invoice.capitalSocial ? `<p>Capital social : ${invoice.capitalSocial}</p>` : ''}
    ${invoice.vatNumber ? `<p>N° TVA intracommunautaire : ${invoice.vatNumber}</p>` : ''}
    ${invoice.paymentTermsText ? `<p>${invoice.paymentTermsText}</p>` : '<p>Règlement à réception de facture</p>'}
    <p>${
      invoice.latePaymentPenalty ??
      'En cas de retard de paiement, des pénalités de retard au taux légal en vigueur seront appliquées. Indemnité forfaitaire pour frais de recouvrement : 40 €.'
    }</p>
    <p>Escompte pour paiement anticipé : néant.</p>
  </div>`
    : '';

  const taxRows = invoice.taxBreakdown
    .map(
      (t) => `
    <tr class="tax-row">
      <td colspan="4">${t.taxName} (${t.rate}%)</td>
      <td class="num">${invoice.currency} ${fmt(t.amount)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #1a1a2e; }
  .invoice { max-width: 800px; margin: 0 auto; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .logo { font-size: 28px; font-weight: 800; color: #4f46e5; letter-spacing: -1px; }
  .logo span { color: #111827; }
  .invoice-meta { text-align: right; }
  .invoice-meta h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .invoice-meta .number { font-size: 14px; color: #6b7280; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .party h3 { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 6px; }
  .party .name { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 2px; }
  .party .trn { font-size: 11px; color: #6b7280; margin-top: 4px; background: #f3f4f6; display: inline-block; padding: 2px 6px; border-radius: 4px; }
  .party p { color: #6b7280; line-height: 1.5; }
  .dates { display: flex; gap: 24px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 24px; }
  .date-item label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; display: block; }
  .date-item span { font-size: 13px; font-weight: 600; color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #4f46e5; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.num { text-align: right; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.bold { font-weight: 600; }
  td.desc { max-width: 280px; }
  .totals { margin-left: auto; width: 280px; }
  .totals table { margin-bottom: 0; }
  .totals td { padding: 6px 12px; border-bottom: none; }
  .tax-row td { color: #6b7280; font-size: 11px; }
  .subtotal-row td { font-weight: 500; }
  .grand-total td { font-size: 15px; font-weight: 700; color: #4f46e5; border-top: 2px solid #e5e7eb; padding-top: 10px; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
  .notes { color: #6b7280; font-size: 11px; max-width: 360px; }
  .payment-terms { text-align: right; font-size: 11px; color: #6b7280; }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div class="logo">NEXUS<span>CRM</span></div>
    <div class="invoice-meta">
      <h1>TAX INVOICE</h1>
      <div class="number">${invoice.invoiceNumber}</div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <div class="name">${invoice.vendor.name}</div>
      <p>${invoice.vendor.address.replace(/\n/g, '<br>')}</p>
      ${invoice.vendor.trn ? `<div class="trn">TRN: ${invoice.vendor.trn}</div>` : ''}
      ${invoice.vendor.email ? `<p>${invoice.vendor.email}</p>` : ''}
    </div>
    <div class="party">
      <h3>Bill To</h3>
      <div class="name">${invoice.buyer.name}</div>
      <p>${invoice.buyer.address.replace(/\n/g, '<br>')}</p>
      ${invoice.buyer.trn ? `<div class="trn">TRN: ${invoice.buyer.trn}</div>` : ''}
      ${invoice.buyer.email ? `<p>${invoice.buyer.email}</p>` : ''}
    </div>
  </div>
  <div class="dates">
    <div class="date-item"><label>Invoice Date</label><span>${invoice.issueDate}</span></div>
    <div class="date-item"><label>Due Date</label><span>${invoice.dueDate}</span></div>
    <div class="date-item"><label>Currency</label><span>${invoice.currency}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th>
        <th class="num">Tax %</th><th class="num">Tax Amt</th><th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${lineItemRows}</tbody>
  </table>
  <div class="totals">
    <table>
      <tr class="subtotal-row"><td>Subtotal</td><td class="num">${invoice.currency} ${fmt(invoice.subtotal)}</td></tr>
      ${taxRows}
      <tr class="tax-row"><td>Total Tax</td><td class="num">${invoice.currency} ${fmt(invoice.totalTax)}</td></tr>
      <tr class="grand-total"><td>TOTAL DUE</td><td class="num">${invoice.currency} ${fmt(invoice.grandTotal)}</td></tr>
    </table>
  </div>
  <div class="footer">
    ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : '<div></div>'}
    <div class="payment-terms">${invoice.paymentTerms ? `<p>${invoice.paymentTerms}</p>` : ''}</div>
  </div>
  ${frenchLegalHtml}
</div>
</body>
</html>`;
}
