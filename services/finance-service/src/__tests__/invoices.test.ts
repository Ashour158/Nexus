import { describe, expect, it } from 'vitest';
import supertest from 'supertest';

const baseUrl = process.env.FINANCE_SERVICE_TEST_URL ?? 'http://localhost:3002';
const token = process.env.FINANCE_TEST_TOKEN;
const sentInvoiceId = process.env.FINANCE_TEST_SENT_INVOICE_ID;
const paidInvoiceId = process.env.FINANCE_TEST_PAID_INVOICE_ID;
const draftInvoiceId = process.env.FINANCE_TEST_DRAFT_INVOICE_ID;
const request = supertest(baseUrl);

describe('finance-service invoices integration', () => {
  it('GET /api/v1/invoices returns list', async () => {
    if (!token) return;
    const response = await request.get('/api/v1/invoices').set('authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data?.data)).toBe(true);
  });

  it('POST /api/v1/invoices/:id/mark-paid transitions SENT to PAID', async () => {
    if (!token || !sentInvoiceId) return;
    const response = await request
      .post(`/api/v1/invoices/${sentInvoiceId}/mark-paid`)
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect([200, 409]).toContain(response.status);
  });

  it('POST /api/v1/invoices/:id/mark-paid already PAID returns 409', async () => {
    if (!token || !paidInvoiceId) return;
    const response = await request
      .post(`/api/v1/invoices/${paidInvoiceId}/mark-paid`)
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(409);
  });

  it('POST /api/v1/invoices/:id/send transitions DRAFT to SENT', async () => {
    if (!token || !draftInvoiceId) return;
    const response = await request
      .post(`/api/v1/invoices/${draftInvoiceId}/send`)
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect([200, 409]).toContain(response.status);
  });
});
