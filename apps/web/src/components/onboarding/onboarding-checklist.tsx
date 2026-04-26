'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, X } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  completed: boolean;
}

const DEFAULT_ITEMS: ChecklistItem[] = [
  { id: 'profile', label: 'Complete your profile', description: 'Add your photo, phone number, and time zone', href: '/settings', completed: false },
  { id: 'contact', label: 'Import or create a contact', description: 'Add your first lead or contact to get started', href: '/contacts/new', completed: false },
  { id: 'connect-calendar', label: 'Connect your calendar', description: 'Enable scheduling and sync for meetings', href: '/settings?tab=integrations', completed: false },
  { id: 'pipeline', label: 'Customize your pipeline', description: 'Add or rename stages to match your sales process', href: '/settings', completed: false },
  { id: 'team', label: 'Invite a teammate', description: 'Collaborate by inviting your first team member', href: '/settings', completed: false },
];

export function OnboardingChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>(DEFAULT_ITEMS);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem('onboarding_dismissed') === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  const completed = items.filter((i) => i.completed).length;
  const progress = Math.round((completed / items.length) * 100);
  const allDone = completed === items.length;

  if (dismissed || allDone) return null;
  function dismiss() {
    try {
      localStorage.setItem('onboarding_dismissed', 'true');
    } catch {}
    setDismissed(true);
  }


  function toggle(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));
  }

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
              {completed} of {items.length} steps completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
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
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-gray-50">
              <button onClick={() => toggle(item.id)} className="mt-0.5 flex-shrink-0" aria-label={`Toggle ${item.label}`}>
                {item.completed ? <CheckCircle2 className="h-5 w-5 text-blue-600" /> : <Circle className="h-5 w-5 text-gray-300" />}
              </button>
              <div className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={`text-sm font-medium hover:underline ${item.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}
                >
                  {item.label}
                </Link>
                <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!collapsed ? (
        <div className="px-5 pb-3">
          <button onClick={dismiss} className="mt-2 text-xs text-gray-400 hover:text-gray-500">Skip for now</button>
        </div>
      ) : null}
    </div>
  );
}
