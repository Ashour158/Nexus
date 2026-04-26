'use client';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Admin Settings</h2>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-300">
        Configure global admin preferences, incident channels, retention windows, and default onboarding policies.
      </div>
    </div>
  );
}
