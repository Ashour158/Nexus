'use client';

import { useTransition } from 'react';

const LOCALES = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ar', label: 'عربي', flag: 'AR' },
];

export function LocaleSwitcher({ currentLocale }: { currentLocale: string }) {
  const [isPending, startTransition] = useTransition();

  function switchLocale(locale: string) {
    startTransition(() => {
      document.cookie = `NEXUS_LOCALE=${locale};path=/;max-age=31536000`;
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((locale) => (
        <button
          key={locale.code}
          onClick={() => switchLocale(locale.code)}
          disabled={isPending || currentLocale === locale.code}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            currentLocale === locale.code
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
          title={locale.label}
        >
          {locale.flag}
        </button>
      ))}
    </div>
  );
}
