'use client';

import { useState } from 'react';

export default function PortalSettingsPage() {
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [welcomeMsg, setWelcomeMsg] = useState('Welcome to your customer portal.');
  const [customDomain, setCustomDomain] = useState('');

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portal Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Customize what your customers see in their portal.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-gray-800">Branding</h3>
        <div>
          <label className="text-sm font-medium text-gray-700">Primary color</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded"
            />
            <span className="text-sm text-gray-600">{primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Welcome message</label>
          <textarea
            value={welcomeMsg}
            onChange={(e) => setWelcomeMsg(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Custom domain (CNAME)</label>
          <input
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="portal.yourcompany.com"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">Point a CNAME record to portal.nexuscrm.io</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
          Save settings
        </button>
      </div>
    </div>
  );
}
