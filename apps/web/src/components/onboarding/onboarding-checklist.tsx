'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, X } from 'lucide-react';
import { useOnboarding } from '@/hooks/use-onboarding';

/**
 * Dashboard entry point for the first-run Onboarding Wizard (PC-20 / LR-01).
 *
 * Reads real, persisted onboarding state from `/api/onboarding` (per tenant).
 * Each item maps to a wizard step id and deep-links into `/onboarding`. The card
 * hides once onboarding is marked complete server-side, or when the user
 * dismisses it locally for this browser.
 */

interface ChecklistItem {
  /** Matches a step id persisted by the wizard. */
  id: string;
  label: string;
  description: string;
}

const ITEMS: ChecklistItem[] = [
  { id: 'profile', label: 'Set up your company profile', description: 'Name, industry, and logo' },
  { id: 'pipeline', label: 'Create your first pipeline', description: 'Model your sales process' },
  { id: 'team', label: 'Invite a teammate', description: 'Collaborate with your team' },
  { id: 'import', label: 'Import your data', description: 'Bring contacts and accounts from your old CRM' },
];

export function OnboardingChecklist() {
  const { data: state, isLoading } = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const steps = state?.steps ?? {};
  const completedCount = ITEMS.filter((i) => steps[i.id]).length;
  const progress = Math.round((completedCount / ITEMS.length) * 100);

  // Hide while loading, once onboarding is complete server-side, or if dismissed.
  if (isLoading || dismissed || state?.completed) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors hover:bg-blue-50/30"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            {progress}%
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Get started with NEXUS</p>
            <p className="text-xs text-gray-500">
              {completedCount} of {ITEMS.length} steps completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/onboarding"
            onClick={(e) => e.stopPropagation()}
            className="hidden rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:inline-block"
          >
            {completedCount > 0 ? 'Resume setup' : 'Start setup'}
          </Link>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="rounded-md p-1 transition-colors hover:bg-gray-100"
            aria-label="Dismiss checklist"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="h-1 bg-gray-100">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {!collapsed ? (
        <div className="divide-y divide-gray-50">
          {ITEMS.map((item) => {
            const done = !!steps[item.id];
            return (
              <Link
                key={item.id}
                href="/onboarding"
                className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50"
              >
                <span className="mt-0.5 flex-shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={`text-sm font-medium ${
                      done ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {item.label}
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
                </div>
              </Link>
            );
          })}
          <div className="px-5 py-3">
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-gray-400 hover:text-gray-500"
            >
              Skip for now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
