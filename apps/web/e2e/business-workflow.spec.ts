import { test, expect } from '@playwright/test';

test.describe('Business workflow nervous system', () => {
  test('validates and wires lead to customer to RFQ to quote to DRQ', async ({ request }) => {
    const suffix = Date.now().toString(36);
    const accountName = `E2E Enterprise Account ${suffix}`;
    const contactEmail = `buyer+${suffix}@example.com`;

    const invalidContact = await request.post('/api/crm/validation-rules/validate', {
      data: {
        objectType: 'contact',
        data: {
          firstName: 'No',
          lastName: 'Account',
          ownerId: 'dev-admin',
        },
      },
    });
    expect(invalidContact.status()).toBe(422);
    const invalidContactBody = await invalidContact.json();
    expect(invalidContactBody.data.valid).toBe(false);
    expect(invalidContactBody.data.errors.accountId).toBeTruthy();

    const account = await request.post('/api/accounts', {
      data: {
        name: accountName,
        ownerId: 'dev-admin',
        billingCountry: 'EG',
        industry: 'Technology',
        type: 'PROSPECT',
        tier: 'ENTERPRISE',
        phone: '+20 100 000 0000',
        email: `enterprise.account+${suffix}@example.com`,
        website: 'https://enterprise.example.com',
      },
    });
    expect(account.status()).toBe(201);
    const accountBody = await account.json();
    const accountId = accountBody.data.id;
    expect(accountId).toBeTruthy();

    const contact = await request.post('/api/contacts', {
      data: {
        accountId,
        ownerId: 'dev-admin',
        firstName: 'E2E',
        lastName: 'Buyer',
        email: contactEmail,
        gdprConsent: true,
      },
    });
    expect(contact.status()).toBe(201);
    const contactBody = await contact.json();
    const contactId = contactBody.data.id;
    expect(contactId).toBeTruthy();

    const deal = await request.post('/api/deals', {
      data: {
        accountId,
        accountName,
        ownerId: 'dev-admin',
        pipelineId: 'pipeline-enterprise',
        stageId: 'stage-proposal',
        name: `E2E Commercial Deal ${suffix}`,
        amount: '125000',
        currency: 'USD',
        expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(deal.status()).toBe(201);
    const dealBody = await deal.json();
    const dealId = dealBody.data.id;
    expect(dealId).toBeTruthy();

    const rfq = await request.post('/api/finance/rfqs', {
      data: {
        accountId,
        contactId,
        dealId,
        ownerId: 'dev-admin',
        title: `E2E RFQ ${suffix}`,
        currency: 'USD',
      },
    });
    expect(rfq.status()).toBe(201);
    const rfqBody = await rfq.json();
    expect(rfqBody.data.id).toBeTruthy();

    const quote = await request.post('/api/quotes', {
      data: {
        accountId,
        contactId,
        dealId,
        ownerId: 'dev-admin',
        name: `E2E Quote ${suffix}`,
        currency: 'USD',
        subtotal: '125000',
        total: '125000',
        paymentTerms: 'NET_30',
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(quote.status()).toBe(201);
    const quoteBody = await quote.json();
    const quoteId = quoteBody.data.quote.id;
    expect(quoteId).toBeTruthy();

    const drq = await request.post('/api/finance/discount-requests', {
      data: {
        quoteId,
        requestedDiscountPercent: 12,
        reasonCode: 'STRATEGIC_ACCOUNT',
        reasonNotes: 'Strategic account expansion needs aligned pricing.',
        winningProbabilityIfApproved: 72,
        approverHierarchy: [{ level: 1, approver: 'Finance Manager' }],
      },
    });
    expect(drq.status()).toBe(201);

    const contactQuotes = await request.get(`/api/contacts/${contactId}/quotes`);
    expect(contactQuotes.status()).toBe(200);
    const contactQuotesBody = await contactQuotes.json();
    expect(JSON.stringify(contactQuotesBody)).toContain(quoteId);

    const accountQuotes = await request.get(`/api/accounts/${accountId}/quotes`);
    expect(accountQuotes.status()).toBe(200);
    const accountQuotesBody = await accountQuotes.json();
    expect(JSON.stringify(accountQuotesBody)).toContain(quoteId);
  });
});
