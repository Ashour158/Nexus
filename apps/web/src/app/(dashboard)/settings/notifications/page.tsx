'use client';

import { Bell, Mail, MessageSquare, Smartphone, MessageCircle } from 'lucide-react';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from '@/hooks/use-notification-preferences';

const CHANNEL_META: Record<
  NotificationChannel,
  { label: string; description: string; icon: typeof Bell; locked?: boolean }
> = {
  IN_APP: {
    label: 'In-app',
    description: 'Show notifications in the bell menu. Always on.',
    icon: Bell,
    locked: true,
  },
  EMAIL: {
    label: 'Email',
    description: 'Deal, lead and quote alerts sent to your inbox.',
    icon: Mail,
  },
  SMS: {
    label: 'SMS',
    description: 'Text messages to your phone for time-sensitive alerts.',
    icon: MessageSquare,
  },
  PUSH: {
    label: 'Push',
    description: 'Push notifications to your registered devices.',
    icon: Smartphone,
  },
  WHATSAPP: {
    label: 'WhatsApp',
    description: 'Alerts delivered over WhatsApp.',
    icon: MessageCircle,
  },
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-surface-container-highest'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const update = useUpdateNotificationPreference();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-on-surface">Notification Preferences</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        Choose how you want to be notified. In-app notifications are always on;
        every other channel can be turned off.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
        {isLoading || !prefs ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {NOTIFICATION_CHANNELS.map((channel) => {
              const meta = CHANNEL_META[channel];
              const Icon = meta.icon;
              const enabled = meta.locked ? true : prefs[channel];
              return (
                <li
                  key={channel}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-on-surface">
                        {meta.label}
                        {meta.locked && (
                          <span className="ms-2 rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-normal text-on-surface-variant">
                            Always on
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-on-surface-variant">{meta.description}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={enabled}
                    disabled={meta.locked || update.isPending}
                    onChange={(next) => update.mutate({ channel, enabled: next })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
