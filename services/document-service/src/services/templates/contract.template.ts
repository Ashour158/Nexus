function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderContractHtml(data: Record<string, unknown>): string {
  const contractNumber = esc(String(data.contractNumber ?? '—'));
  const title = esc(String(data.title ?? 'Service Agreement'));
  const accountName = esc(String(data.accountName ?? 'Client'));
  const startDate = esc(String(data.startDate ?? ''));
  const endDate = esc(String(data.endDate ?? ''));
  const value = Number(data.value ?? 0).toFixed(2);
  const currency = esc(String(data.currency ?? 'USD'));
  const terms = esc(String(data.terms ?? ''));
  const renewalTerms = esc(String(data.renewalTerms ?? ''));
  const terminationClause = esc(String(data.terminationClause ?? ''));
  const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];

  const lineItemRows = lineItems
    .map((item: unknown) => {
      const it = item as Record<string, unknown>;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd;">${esc(String(it.description ?? ''))}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(it.quantity ?? 1)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(it.unitPrice ?? 0).toFixed(2)} ${currency}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(it.total ?? 0).toFixed(2)} ${currency}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — ${contractNumber}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; line-height: 1.6; }
    h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .header div { flex: 1; }
    .section { margin: 20px 0; }
    .section h2 { font-size: 1.1em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #f5f5f5; padding: 8px; border: 1px solid #ddd; text-align: left; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
    .signature-block { width: 45%; }
    .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; }
    .total { text-align: right; font-size: 1.2em; font-weight: bold; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="header">
    <div>
      <strong>Contract #:</strong> ${contractNumber}<br>
      <strong>Client:</strong> ${accountName}<br>
      <strong>Start Date:</strong> ${startDate}<br>
      <strong>End Date:</strong> ${endDate}
    </div>
    <div style="text-align:right;">
      <strong>Total Value:</strong> ${value} ${currency}
    </div>
  </div>

  <div class="section">
    <h2>Line Items</h2>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows || '<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:center;">No line items</td></tr>'}
      </tbody>
    </table>
    <div class="total">Contract Total: ${value} ${currency}</div>
  </div>

  <div class="section">
    <h2>Terms & Conditions</h2>
    <p>${terms || 'Standard terms and conditions apply.'}</p>
  </div>

  ${renewalTerms ? `<div class="section"><h2>Renewal Terms</h2><p>${renewalTerms}</p></div>` : ''}
  ${terminationClause ? `<div class="section"><h2>Termination</h2><p>${terminationClause}</p></div>` : ''}

  <div class="signatures">
    <div class="signature-block">
      <div class="signature-line">NEXUS CRM Authorized Signatory</div>
      <div style="margin-top:10px;font-size:0.9em;color:#666;">Date: _______________</div>
    </div>
    <div class="signature-block">
      <div class="signature-line">${accountName} Authorized Signatory</div>
      <div style="margin-top:10px;font-size:0.9em;color:#666;">Date: _______________</div>
    </div>
  </div>
</body>
</html>`;
}
