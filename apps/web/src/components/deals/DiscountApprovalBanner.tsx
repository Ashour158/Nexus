'use client';

import { useState } from 'react';

interface DiscountApprovalBannerProps {
  discountPercent?: number;
  thresholdPercent: number;
  onRequestApproval?: () => void;
}

export function DiscountApprovalBanner({ discountPercent, thresholdPercent, onRequestApproval }: DiscountApprovalBannerProps) {
  const [requested, setRequested] = useState(false);
  if (discountPercent == null || discountPercent <= thresholdPercent) return null;

  return (
    <div className="rounded-lg border border-warning/40 bg-warning-container p-3 text-sm text-on-warning-container">
      <p>?? Discount of {discountPercent}% exceeds your limit of {thresholdPercent}%.</p>
      <p>This deal requires manager approval before sending a quote.</p>
      <button
        onClick={() => {
          setRequested(true);
          onRequestApproval?.();
        }}
        className="mt-2 rounded bg-warning px-3 py-1.5 text-xs font-medium text-white"
      >
        Request Approval
      </button>
      {requested ? <p className="mt-1 text-xs text-on-warning-container">Approval request sent to manager queue.</p> : null}
    </div>
  );
}
