'use client';

import { Sparkles } from 'lucide-react';

/**
 * "What's new" — a lightweight, static release-notes surface. Kept intentionally
 * simple (a curated changelog in-file) and linked from the Help drawer and the
 * user menu. Newest release first.
 */

interface ReleaseEntry {
  version: string;
  date: string;
  tag: 'Added' | 'Improved' | 'Fixed';
  items: string[];
}

const TAG_STYLES: Record<ReleaseEntry['tag'], string> = {
  Added: 'bg-primary-container text-on-primary-container',
  Improved: 'bg-tertiary-container text-on-tertiary-container',
  Fixed: 'bg-secondary-container text-on-secondary-container',
};

const RELEASES: { version: string; date: string; groups: ReleaseEntry[] }[] = [
  {
    version: '2026.7',
    date: 'July 2026',
    groups: [
      {
        version: '2026.7',
        date: 'July 2026',
        tag: 'Added',
        items: [
          'In-app Help drawer with Knowledge Base search, available from the top bar.',
          'Cookie-consent controls — analytics stay off until you opt in.',
          'This "What\'s new" page, linked from Help and your account menu.',
        ],
      },
      {
        version: '2026.7',
        date: 'July 2026',
        tag: 'Improved',
        items: [
          'System Map now reflects the true live status of every module.',
          'Cleaner navigation — retired duplicate routes and consolidated menus.',
          'Clearer breadcrumbs across every page.',
        ],
      },
      {
        version: '2026.7',
        date: 'July 2026',
        tag: 'Fixed',
        items: [
          'Removed placeholder "coming soon" panels from Settings.',
          'Webhook management now links to the live configuration screen.',
        ],
      },
    ],
  },
  {
    version: '2026.6',
    date: 'June 2026',
    groups: [
      {
        version: '2026.6',
        date: 'June 2026',
        tag: 'Added',
        items: [
          'Support Tickets and Marketing Campaigns modules.',
          'Commission plans with per-rep statements on won deals.',
          'Customer journey builder with triggers, steps, and enrollments.',
        ],
      },
      {
        version: '2026.6',
        date: 'June 2026',
        tag: 'Improved',
        items: [
          'Faster global search across contacts, deals, leads, and notes.',
          'Dark mode across the core workspace.',
        ],
      },
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">What&apos;s new</h1>
          <p className="text-sm text-on-surface-variant">
            The latest improvements and additions to Nexus CRM.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {RELEASES.map((release) => (
          <section
            key={release.version}
            className="rounded-2xl border border-outline-variant bg-surface p-5"
          >
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-on-surface">Release {release.version}</h2>
              <span className="text-xs font-medium text-on-surface-variant">{release.date}</span>
            </div>
            <div className="space-y-4">
              {release.groups.map((group, gi) => (
                <div key={gi}>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TAG_STYLES[group.tag]}`}
                  >
                    {group.tag}
                  </span>
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((item, ii) => (
                      <li
                        key={ii}
                        className="flex gap-2 text-sm text-on-surface-variant"
                      >
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
