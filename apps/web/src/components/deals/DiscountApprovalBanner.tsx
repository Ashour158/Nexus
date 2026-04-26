'use client';

import { useState } from 'react';

interface DiscountApprovalBannerProps {
  discountPercent: number;
  thresholdPercent: number;
  onRequestApproval?: () => void;
}

export function DiscountApprovalBanner({ discountPercent, thresholdPercent, onRequestApproval }: DiscountApprovalBannerProps) {
  const [requested, setRequested] = useState(false);
  if (discountPercent <= thresholdPercent) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>?? Discount of {discountPercent}% exceeds your limit of {thresholdPercent}%.</p>
      <p>This deal requires manager approval before sending a quote.</p>
      <button
        onClick={() => {
          setRequested(true);
          onRequestApproval?.();
        }}
        className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white"
      >
        Request Approval
      </button>
      {requested ? <p className="mt-1 text-xs text-amber-800">Approval request sent to manager queue.</p> : null}
    </div>
  );
}
