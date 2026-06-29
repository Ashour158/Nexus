import crypto from 'crypto';
import { createHttpClient } from '@nexus/service-utils';

export type ZatcaInvoice = {
  invoiceId: string;
  tenantId: string;
  invoiceNumber: string;
  issueDate: string;
  issueTime: string;
  invoiceType: 'STANDARD' | 'SIMPLIFIED';
  currency: string;
  sellerName: string;
  sellerTrn: string;
  buyerName: string;
  buyerTrn?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    vatAmount: number;
    lineTotal: number;
  }>;
  subtotal: number;
  vatTotal: number;
  total: number;
  previousHash?: string;
};

export type ZatcaSubmissionResult = {
  status: 'CLEARED' | 'REPORTED' | 'NOT_COMPLIANT' | 'ERROR';
  clearanceStatus?: string;
  reportingStatus?: string;
  warnings?: string[];
  errors?: string[];
  zatcaUuid?: string;
  qrCode?: string;
  invoiceHash?: string;
};

function generateInvoiceHash(invoice: ZatcaInvoice): string {
  const canonical = JSON.stringify({
    id: invoice.invoiceNumber,
    date: invoice.issueDate,
    time: invoice.issueTime,
    seller: invoice.sellerTrn,
    buyer: invoice.buyerTrn ?? '',
    total: invoice.total,
    vat: invoice.vatTotal,
  });
  return crypto.createHash('sha256').update(canonical).digest('base64');
}

function generateQrCode(invoice: ZatcaInvoice, invoiceHash: string): string {
  function tlv(tag: number, value: string): string {
    const valueBytes = Buffer.from(value, 'utf8');
    const header = Buffer.allocUnsafe(2);
    header[0] = tag & 0xff;
    header[1] = valueBytes.length & 0xff;
    return Buffer.concat([header, valueBytes]).toString('base64');
  }
  const qrData = [
    tlv(1, invoice.sellerName),
    tlv(2, invoice.sellerTrn),
    tlv(3, `${invoice.issueDate}T${invoice.issueTime}Z`),
    tlv(4, invoice.total.toFixed(2)),
    tlv(5, invoice.vatTotal.toFixed(2)),
    tlv(6, invoiceHash),
  ].join('');
  return qrData;
}

export async function submitToZatca(invoice: ZatcaInvoice): Promise<ZatcaSubmissionResult> {
  const zatcaUrl = process.env.ZATCA_API_URL;
  const zatcaClientId = process.env.ZATCA_CLIENT_ID;
  const zatcaClientSecret = process.env.ZATCA_CLIENT_SECRET;

  const invoiceHash = generateInvoiceHash(invoice);
  const qrCode = generateQrCode(invoice, invoiceHash);

  if (!zatcaUrl || !zatcaClientId || !zatcaClientSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ZATCA credentials not configured — cannot submit invoice in production');
    }
    return {
      status: 'CLEARED',
      clearanceStatus: 'PASS',
      warnings: ['ZATCA credentials not configured — simulated clearance (dev only)'],
      zatcaUuid: crypto.randomUUID(),
      qrCode,
      invoiceHash,
    };
  }

  const xmlPayload = buildZatcaXml(invoice, invoiceHash, qrCode);
  const encodedInvoice = Buffer.from(xmlPayload).toString('base64');

  const client = createHttpClient({
    baseURL: zatcaUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Version': 'V2',
      Authorization: `Basic ${Buffer.from(`${zatcaClientId}:${zatcaClientSecret}`).toString('base64')}`,
    },
    timeoutMs: 15_000,
    maxRetries: 3,
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 60_000 },
  });

  const endpoint =
    invoice.invoiceType === 'STANDARD'
      ? '/invoices/clearance/single'
      : '/invoices/reporting/single';

  let result: {
    clearanceStatus?: string;
    reportingStatus?: string;
    warnings?: Array<{ message: string }>;
    errors?: Array<{ message: string }>;
    clearedInvoice?: string;
  };

  try {
    result = await client.post<typeof result>(endpoint, {
      invoice: encodedInvoice,
      invoiceHash,
      uuid: crypto.randomUUID(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'ERROR',
      errors: [`ZATCA API error: ${message}`],
      invoiceHash,
      qrCode,
    };
  }

  const ok =
    result.clearanceStatus === 'PASS' || result.reportingStatus === 'REPORTED';
  const outStatus: ZatcaSubmissionResult['status'] = ok
    ? invoice.invoiceType === 'STANDARD'
      ? 'CLEARED'
      : 'REPORTED'
    : 'NOT_COMPLIANT';

  return {
    status: outStatus,
    clearanceStatus: result.clearanceStatus,
    reportingStatus: result.reportingStatus,
    warnings: result.warnings?.map((w) => w.message),
    errors: result.errors?.map((e) => e.message),
    qrCode,
    invoiceHash,
  };
}

function buildZatcaXml(invoice: ZatcaInvoice, hash: string, qrCode: string): string {
  const lineItemsXml = invoice.lineItems
    .map(
      (item, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="PCE">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${invoice.currency}">${item.lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>${escapeXml(item.description)}</cbc:Name></cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${invoice.currency}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${invoice.currency}">${item.vatAmount.toFixed(2)}</cbc:TaxAmount>
      </cac:TaxTotal>
    </cac:InvoiceLine>`
    )
    .join('');

  const invUuid = crypto.randomUUID();

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${invUuid}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoice.invoiceType === 'STANDARD' ? '0100000' : '0200000'}">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(qrCode)}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(invoice.sellerName)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(invoice.sellerTrn)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(invoice.buyerName)}</cbc:Name></cac:PartyName>
      ${invoice.buyerTrn ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(invoice.buyerTrn)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${invoice.currency}">${invoice.vatTotal.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${invoice.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${invoice.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${invoice.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${invoice.currency}">${invoice.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <!-- hash: ${hash} -->
  ${lineItemsXml}
</Invoice>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
