import type { FinancePrisma } from '../prisma.js';

export type DiscountApprovalResult = {
  required: boolean;
  requestId?: string;
  thresholdPercent: number;
  actualDiscountPercent: number;
};

async function fetchApprovalRows(
  tenantId: string,
  quoteId: string
): Promise<Array<{ id: string; status: string }>> {
  const base = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const qs = new URLSearchParams({
    module: 'quote',
    recordId: quoteId,
    limit: '100',
    page: '1',
  });
  const res = await fetch(`${base}/api/v1/approval/requests?${qs.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
  if (!res.ok) return [];
  const envelope = (await res.json()) as {
    success?: boolean;
    data?: { data?: Array<{ id: string; status: string }> };
  };
  return envelope.data?.data ?? [];
}

async function postApprovalRequest(
  tenantId: string,
  quoteId: string,
  requesterId: string,
  quoteReference: string,
  actualDiscountPercent: number,
  discountAmount: number,
  subtotal: number,
  thresholdPercent: number
): Promise<string | undefined> {
  const base = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const res = await fetch(`${base}/api/v1/approval/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({
      module: 'quote',
      recordId: quoteId,
      requestedBy: requesterId,
      data: {
        quoteId,
        quoteReference,
        discountPercent: actualDiscountPercent,
        discountAmount,
        subtotal,
        thresholdPercent,
        reason: 'DISCOUNT_THRESHOLD',
      },
    }),
  });

  if (!res.ok) return undefined;
  const json = (await res.json()) as { success?: boolean; data?: { id?: string } };
  return json.data?.id;
}

export async function checkDiscountApproval(
  _prisma: FinancePrisma,
  tenantId: string,
  quoteId: string,
  subtotal: number,
  discountAmount: number,
  requesterId: string,
  quoteReference: string
): Promise<DiscountApprovalResult> {
  const thresholdPercent = Number(process.env.DISCOUNT_APPROVAL_THRESHOLD ?? 20);
  const actualDiscountPercent =
    subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  if (actualDiscountPercent <= thresholdPercent) {
    return { required: false, thresholdPercent, actualDiscountPercent };
  }

  const rows = await fetchApprovalRows(tenantId, quoteId);
  const pending = rows.find((r) => r.status === 'PENDING');
  if (pending) {
    return {
      required: true,
      requestId: pending.id,
      thresholdPercent,
      actualDiscountPercent,
    };
  }
  const approved = rows.find((r) => r.status === 'APPROVED');
  if (approved) {
    return {
      required: false,
      requestId: approved.id,
      thresholdPercent,
      actualDiscountPercent,
    };
  }

  const requestId = await postApprovalRequest(
    tenantId,
    quoteId,
    requesterId,
    quoteReference,
    actualDiscountPercent,
    discountAmount,
    subtotal,
    thresholdPercent
  );

  return {
    required: true,
    requestId,
    thresholdPercent,
    actualDiscountPercent,
  };
}
