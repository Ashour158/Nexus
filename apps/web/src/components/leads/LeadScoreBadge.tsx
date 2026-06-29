'use client';

import { useEffect, useState } from 'react';

type ScoreTier = 'hot' | 'warm' | 'cold';

interface LeadScoreData {
  score: number;
  tier: ScoreTier;
  signals: Record<string, number>;
  scoredAt: string;
}

const tierConfig: Record<ScoreTier, { label: string; bg: string; text: string; dot: string }> = {
  hot: { label: 'Hot', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  warm: { label: 'Warm', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  cold: { label: 'Cold', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
};

export function LeadScoreBadge({ leadId, showTooltip = true }: { leadId: string; showTooltip?: boolean }) {
  const [scoreData, setScoreData] = useState<LeadScoreData | null>(null);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/lead-scores/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setScoreData(data);
      })
      .catch(() => null);
  }, [leadId]);

  if (!scoreData) return null;

  const cfg = tierConfig[scoreData.tier] || tierConfig.cold;

  return (
    <div className="relative inline-flex">
      <span
        className={`inline-flex cursor-default items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
        onMouseEnter={() => showTooltip && setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label} - {scoreData.score}
      </span>

      {showTip && showTooltip && (
        <div className="absolute bottom-full start-0 z-50 mb-2 w-56 rounded-lg bg-gray-900 p-3 text-xs text-white shadow-lg">
          <p className="mb-2 font-semibold">Score breakdown</p>
          {Object.entries(scoreData.signals).map(([signal, pts]) => (
            <div key={signal} className="flex justify-between py-0.5">
              <span className="capitalize text-gray-300">{signal.replace(/_/g, ' ')}</span>
              <span className={pts >= 0 ? 'text-green-400' : 'text-red-400'}>
                {pts >= 0 ? '+' : ''}
                {pts}
              </span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-gray-700 pt-2 font-semibold">
            <span>Total</span>
            <span>{scoreData.score}</span>
          </div>
          <p className="mt-1 text-[10px] text-gray-500">
            Updated {new Date(scoreData.scoredAt).toLocaleDateString()}
          </p>
          <div className="absolute start-4 top-full border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
