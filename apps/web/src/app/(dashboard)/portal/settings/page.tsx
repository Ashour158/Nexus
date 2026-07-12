'use client';

import { useState } from 'react';

export default function PortalSettingsPage() {
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [welcomeMsg, setWelcomeMsg] = useState('Welcome to your customer portal.');
  const [customDomain, setCustomDomain] = useState('');

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Portal Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Customize what your customers see in their portal.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-outline-variant bg-surface p-6">
        <h3 className="font-semibold text-on-surface">Branding</h3>
        <div>
          <label className="text-sm font-medium text-on-surface">Primary color</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded"
            />
            <span className="text-sm text-on-surface-variant">{primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface">Welcome message</label>
          <textarea
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-on-surface">Custom domain (CNAME)</label>
          <input
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="portal.yourcompany.com"
            className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-on-surface-variant">Point a CNAME record to portal.nexuscrm.io</p>
        </div>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary">
          Save settings
        </button>
      </div>
    </div>
  );
}
