import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
  recordDevAccountCommercialEvent,
  recordDevContactCommercialEvent,
  resolveDevContactIdForCommercialRecord,
} from '@/lib/server/dev-preview-data';

const FINANCE_URL = process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002/api/v1';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const rfq = state.rfqs.find((item) => item.id === params.id);
    if (!rfq) return NextResponse.json(apiError('RFQ not found', 'NOT_FOUND'), { status: 404 });
    if (rfq.status === 'CONVERTED') {
      return NextResponse.json(apiError('Converted RFQs cannot be resubmitted for review.', 'BUSINESS_RULE'), { status: 422 });
    }
    const now = new Date().toISOString();
    rfq.status = 'SUBMITTED_FOR_REVIEW';
    rfq.updatedAt = now;
    const contactId = resolveDevContactIdForCommercialRecord(rfq);
    if (contactId) {
      recordDevContactCommercialEvent(contactId, {
        topic: 'rfq.submitted_for_review',
        title: `RFQ submitted for review: ${rfq.rfqNumber}`,
        actor: rfq.ownerId,
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: { rfqId: rfq.id, rfqNumber: rfq.rfqNumber, dealId: rfq.dealId, accountId: rfq.accountId },
      });
    }
    if (rfq.accountId) {
      recordDevAccountCommercialEvent(String(rfq.accountId), {
        topic: 'rfq.submitted_for_review',
        title: `RFQ submitted for review: ${rfq.rfqNumber}`,
        actor: rfq.ownerId,
        aggregateType: 'rfq',
        aggregateId: rfq.id,
        payload: { rfqId: rfq.id, rfqNumber: rfq.rfqNumber, dealId: rfq.dealId, contactId },
      });
    }
    return NextResponse.json(apiSuccess(rfq));
  }
  const res = await fetch(`${FINANCE_URL}/rfqs/${params.id}/send`, {
    method: 'POST',
    headers: { Authorization: auth ?? '' },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

