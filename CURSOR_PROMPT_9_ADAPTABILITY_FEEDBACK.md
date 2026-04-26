# Prompt 9 — Adaptability + User Feedback

## Context

NEXUS CRM — Next.js 14 App Router, TypeScript 5, Fastify 4, Prisma 5, Tailwind CSS.
This prompt covers two gap areas:

**Bucket 1 — Adaptability:** i18n (English + Arabic), multi-currency display in finance,
feature flag hook.

**Bucket 2 — User Feedback:** PostHog product analytics, in-app feedback widget.

---

## TASK 1 — i18n with `next-intl` (English + Arabic)

### Install

```bash
pnpm --filter web add next-intl
```

### Create `apps/web/messages/en.json`

```json
{
  "nav": {
    "dashboard": "Dashboard",
    "contacts": "Contacts",
    "leads": "Leads",
    "deals": "Deals",
    "accounts": "Accounts",
    "activities": "Activities",
    "reports": "Reports",
    "analytics": "Analytics",
    "calendar": "Calendar",
    "invoices": "Invoices",
    "quotes": "Quotes",
    "contracts": "Contracts",
    "products": "Products",
    "workflows": "Workflows",
    "cadences": "Cadences",
    "territories": "Territories",
    "planning": "Planning",
    "approvals": "Approvals",
    "knowledge": "Knowledge Base",
    "incentives": "Incentives",
    "portal": "Portal",
    "chatbot": "AI Assistant",
    "integrations": "Integrations",
    "settings": "Settings"
  },
  "common": {
    "save": "Save Changes",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search...",
    "loading": "Loading...",
    "noResults": "No results found.",
    "actions": "Actions",
    "status": "Status",
    "date": "Date",
    "name": "Name",
    "email": "Email",
    "phone": "Phone",
    "company": "Company",
    "amount": "Amount",
    "currency": "Currency"
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome back, {name}",
    "totalRevenue": "Total Revenue",
    "openDeals": "Open Deals",
    "newLeads": "New Leads",
    "activitiesThisWeek": "Activities This Week"
  },
  "deals": {
    "title": "Deals",
    "newDeal": "New Deal",
    "pipeline": "Pipeline",
    "value": "Deal Value",
    "stage": "Stage",
    "closeDate": "Close Date",
    "probability": "Probability",
    "owner": "Owner"
  },
  "contacts": {
    "title": "Contacts",
    "newContact": "New Contact",
    "firstName": "First Name",
    "lastName": "Last Name",
    "jobTitle": "Job Title",
    "lastActivity": "Last Activity"
  },
  "settings": {
    "title": "Settings",
    "profile": "Profile",
    "team": "Team",
    "billing": "Billing",
    "integrations": "Integrations",
    "language": "Language",
    "currency": "Default Currency",
    "timezone": "Timezone"
  },
  "feedback": {
    "title": "Send Feedback",
    "placeholder": "Tell us what you think or report a bug...",
    "submit": "Submit",
    "thankYou": "Thank you for your feedback!",
    "type": "Type",
    "bug": "Bug Report",
    "feature": "Feature Request",
    "general": "General"
  }
}
```

### Create `apps/web/messages/ar.json`

```json
{
  "nav": {
    "dashboard": "لوحة التحكم",
    "contacts": "جهات الاتصال",
    "leads": "العملاء المحتملون",
    "deals": "الصفقات",
    "accounts": "الحسابات",
    "activities": "الأنشطة",
    "reports": "التقارير",
    "analytics": "التحليلات",
    "calendar": "التقويم",
    "invoices": "الفواتير",
    "quotes": "عروض الأسعار",
    "contracts": "العقود",
    "products": "المنتجات",
    "workflows": "سير العمل",
    "cadences": "التسلسلات",
    "territories": "المناطق",
    "planning": "التخطيط",
    "approvals": "الموافقات",
    "knowledge": "قاعدة المعرفة",
    "incentives": "الحوافز",
    "portal": "البوابة",
    "chatbot": "المساعد الذكي",
    "integrations": "التكاملات",
    "settings": "الإعدادات"
  },
  "common": {
    "save": "حفظ التغييرات",
    "cancel": "إلغاء",
    "delete": "حذف",
    "edit": "تعديل",
    "create": "إنشاء",
    "search": "بحث...",
    "loading": "جارٍ التحميل...",
    "noResults": "لا توجد نتائج.",
    "actions": "الإجراءات",
    "status": "الحالة",
    "date": "التاريخ",
    "name": "الاسم",
    "email": "البريد الإلكتروني",
    "phone": "الهاتف",
    "company": "الشركة",
    "amount": "المبلغ",
    "currency": "العملة"
  },
  "dashboard": {
    "title": "لوحة التحكم",
    "welcome": "مرحباً بعودتك، {name}",
    "totalRevenue": "إجمالي الإيرادات",
    "openDeals": "الصفقات المفتوحة",
    "newLeads": "العملاء الجدد",
    "activitiesThisWeek": "الأنشطة هذا الأسبوع"
  },
  "deals": {
    "title": "الصفقات",
    "newDeal": "صفقة جديدة",
    "pipeline": "خط الأنابيب",
    "value": "قيمة الصفقة",
    "stage": "المرحلة",
    "closeDate": "تاريخ الإغلاق",
    "probability": "الاحتمالية",
    "owner": "المالك"
  },
  "contacts": {
    "title": "جهات الاتصال",
    "newContact": "جهة اتصال جديدة",
    "firstName": "الاسم الأول",
    "lastName": "اسم العائلة",
    "jobTitle": "المسمى الوظيفي",
    "lastActivity": "آخر نشاط"
  },
  "settings": {
    "title": "الإعدادات",
    "profile": "الملف الشخصي",
    "team": "الفريق",
    "billing": "الفواتير",
    "integrations": "التكاملات",
    "language": "اللغة",
    "currency": "العملة الافتراضية",
    "timezone": "المنطقة الزمنية"
  },
  "feedback": {
    "title": "أرسل ملاحظاتك",
    "placeholder": "أخبرنا برأيك أو أبلغ عن خطأ...",
    "submit": "إرسال",
    "thankYou": "شكراً على ملاحظاتك!",
    "type": "النوع",
    "bug": "تقرير خطأ",
    "feature": "طلب ميزة",
    "general": "عام"
  }
}
```

### Create `apps/web/src/i18n/request.ts`

```typescript
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXUS_LOCALE')?.value ?? 'en';
  const validLocales = ['en', 'ar'];
  const resolvedLocale = validLocales.includes(locale) ? locale : 'en';

  return {
    locale: resolvedLocale,
    messages: (await import(`../../messages/${resolvedLocale}.json`)).default,
  };
});
```

### Create `apps/web/src/i18n/navigation.ts`

```typescript
export const locales = ['en', 'ar'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';

export function isRTL(locale: string): boolean {
  return locale === 'ar';
}
```

### Update `apps/web/next.config.mjs`

Add next-intl plugin. Find the existing config and wrap it:

```javascript
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  // existing config options preserved here
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

### Create `apps/web/src/components/ui/locale-switcher.tsx`

```tsx
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
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            currentLocale === locale.code
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          title={locale.label}
        >
          {locale.flag}
        </button>
      ))}
    </div>
  );
}
```

Add `<LocaleSwitcher>` to the topbar (`apps/web/src/components/layout/topbar.tsx`) — import it
and place it before the notification bell in the right-side controls area.

---

## TASK 2 — Multi-Currency Display in Finance

### Add `currency` field to Prisma schemas

In `services/finance-service/prisma/schema.prisma`, add `currency` field to `Invoice` and `Quote`
models:

```prisma
// Add to Invoice model:
currency    String   @default("USD")

// Add to Quote model:
currency    String   @default("USD")
```

Run the migration:
```bash
pnpm --filter finance-service exec prisma migrate dev --name add_currency_field
```

### Create `apps/web/src/lib/currency.ts`

```typescript
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]['code'];

export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sym = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
    return `${sym}${amount.toLocaleString()}`;
  }
}

export function getCurrencySymbol(currency: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
}
```

### Update `apps/web/src/lib/format.ts`

Replace any hardcoded `formatCurrency` function in `format.ts` with an import from the new
`currency.ts` util, or add this if no currency formatter exists:

```typescript
export { formatCurrency, getCurrencySymbol, SUPPORTED_CURRENCIES } from './currency';
```

### Create `apps/web/src/components/ui/currency-select.tsx`

```tsx
import { SUPPORTED_CURRENCIES } from '@/lib/currency';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CurrencySelect({ value, onChange, className = '' }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol} {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
```

Use `<CurrencySelect>` in the quote and invoice create/edit forms wherever an amount field
appears.

---

## TASK 3 — Feature Flag Hook

Create `apps/web/src/lib/feature-flags.ts`:

```typescript
/**
 * Feature flags for NEXUS CRM.
 * Set flags via environment variables (NEXT_PUBLIC_FF_*) or the flags object below.
 * In production, replace with GrowthBook or LaunchDarkly SDK.
 */

const FLAGS = {
  // Core features — always on
  DEALS_PIPELINE:          true,
  CONTACTS:                true,
  FINANCE:                 true,

  // Phase 9-12 features — toggle per environment
  CADENCES:                envFlag('NEXT_PUBLIC_FF_CADENCES', true),
  TERRITORY:               envFlag('NEXT_PUBLIC_FF_TERRITORY', true),
  PLANNING:                envFlag('NEXT_PUBLIC_FF_PLANNING', true),
  APPROVALS:               envFlag('NEXT_PUBLIC_FF_APPROVALS', true),
  KNOWLEDGE:               envFlag('NEXT_PUBLIC_FF_KNOWLEDGE', true),
  INCENTIVES:              envFlag('NEXT_PUBLIC_FF_INCENTIVES', true),
  PORTAL:                  envFlag('NEXT_PUBLIC_FF_PORTAL', true),
  CHATBOT:                 envFlag('NEXT_PUBLIC_FF_CHATBOT', true),

  // Experimental — off by default
  AI_SCORING:              envFlag('NEXT_PUBLIC_FF_AI_SCORING', false),
  CAMPAIGN_MANAGEMENT:     envFlag('NEXT_PUBLIC_FF_CAMPAIGNS', false),
  MOBILE_APP:              envFlag('NEXT_PUBLIC_FF_MOBILE', false),
  MULTI_CURRENCY:          envFlag('NEXT_PUBLIC_FF_MULTI_CURRENCY', true),
  I18N:                    envFlag('NEXT_PUBLIC_FF_I18N', true),
} as const;

function envFlag(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return process.env[key] !== undefined
      ? process.env[key] === 'true'
      : defaultValue;
  }
  const val = (window as any).__NEXUS_FLAGS__?.[key];
  return val !== undefined ? val : defaultValue;
}

export type FeatureFlag = keyof typeof FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] ?? false;
}
```

Create `apps/web/src/hooks/use-feature-flag.ts`:

```typescript
'use client';

import { isEnabled, type FeatureFlag } from '@/lib/feature-flags';

export function useFeatureFlag(flag: FeatureFlag): boolean {
  return isEnabled(flag);
}
```

Add feature flag env vars to `apps/web/.env.example`:

```
# Feature Flags (set to "false" to disable a module)
NEXT_PUBLIC_FF_CADENCES=true
NEXT_PUBLIC_FF_TERRITORY=true
NEXT_PUBLIC_FF_PLANNING=true
NEXT_PUBLIC_FF_APPROVALS=true
NEXT_PUBLIC_FF_KNOWLEDGE=true
NEXT_PUBLIC_FF_INCENTIVES=true
NEXT_PUBLIC_FF_PORTAL=true
NEXT_PUBLIC_FF_CHATBOT=true
NEXT_PUBLIC_FF_AI_SCORING=false
NEXT_PUBLIC_FF_CAMPAIGNS=false
NEXT_PUBLIC_FF_MULTI_CURRENCY=true
NEXT_PUBLIC_FF_I18N=true
```

---

## TASK 4 — PostHog Product Analytics

### Install

```bash
pnpm --filter web add posthog-js posthog-node
```

### Create `apps/web/src/lib/posthog.ts`

```typescript
import PostHog from 'posthog-js';

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (process.env.NODE_ENV !== 'production') return;

  PostHog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // manual events only
    persistence: 'localStorage+cookie',
  });
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  PostHog.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  PostHog.identify(userId, traits);
}

// Key events to track
export const EVENTS = {
  DEAL_CREATED:         'deal_created',
  DEAL_STAGE_CHANGED:   'deal_stage_changed',
  CONTACT_CREATED:      'contact_created',
  LEAD_CREATED:         'lead_created',
  INVOICE_CREATED:      'invoice_created',
  QUOTE_CREATED:        'quote_created',
  REPORT_VIEWED:        'report_viewed',
  CADENCE_ENROLLED:     'cadence_enrolled',
  SEARCH_USED:          'search_used',
  COMMAND_PALETTE_USED: 'command_palette_used',
} as const;
```

### Create `apps/web/src/components/analytics-provider.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { initPostHog, identifyUser } from '@/lib/posthog';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id, {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        tenantId: user.tenantId,
      });
    }
  }, [user?.id]);

  return <>{children}</>;
}
```

### Update `apps/web/src/app/(dashboard)/layout.tsx`

Wrap children with `<AnalyticsProvider>` alongside the existing `<ErrorBoundary>`:

```tsx
import { ErrorBoundary } from '@/components/error-boundary';
import { AnalyticsProvider } from '@/components/analytics-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AnalyticsProvider>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </AnalyticsProvider>
    </AppShell>
  );
}
```

### Add PostHog env vars to `apps/web/.env.example`

```
NEXT_PUBLIC_POSTHOG_KEY=phc_CHANGE_ME
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

## TASK 5 — In-App Feedback Widget

Create `apps/web/src/components/feedback-widget.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { trackEvent, EVENTS } from '@/lib/posthog';

type FeedbackType = 'bug' | 'feature' | 'general';

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('general');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setIsSubmitting(true);

    try {
      // Send to notification-service or just track in PostHog
      trackEvent('feedback_submitted', { type, message: message.substring(0, 200) });

      // Optionally POST to your own endpoint
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message }),
      }).catch(() => null); // silent fail — PostHog capture is the source of truth

      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setType('general');
        setIsOpen(false);
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Send feedback"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Feedback
      </button>

      {/* Modal backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6">
          <div
            className="fixed inset-0 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-5">
            {submitted ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Thank you for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Send Feedback</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  {(['general', 'bug', 'feature'] as FeedbackType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        type === t
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {t === 'bug' ? 'Bug' : t === 'feature' ? 'Feature' : 'General'}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you think or describe a bug..."
                  rows={4}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />

                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="mt-3 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

### Add to `apps/web/src/app/(dashboard)/layout.tsx`

Import and add `<FeedbackWidget />` just before the closing tag of the layout:

```tsx
import { FeedbackWidget } from '@/components/feedback-widget';

// Inside DashboardLayout return:
return (
  <AppShell>
    <AnalyticsProvider>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AnalyticsProvider>
    <FeedbackWidget />
  </AppShell>
);
```

---

## Verification Checklist

```bash
# 1. Check message files exist
ls apps/web/messages/

# 2. Check i18n config
ls apps/web/src/i18n/

# 3. Check currency util
grep -c "formatCurrency" apps/web/src/lib/currency.ts

# 4. Check feature flags
grep -c "NEXT_PUBLIC_FF_" apps/web/.env.example

# 5. Check PostHog install
grep "posthog" apps/web/package.json

# 6. Check feedback widget
wc -l apps/web/src/components/feedback-widget.tsx

# 7. Check layout has all 3 wrappers
grep -E "AnalyticsProvider|ErrorBoundary|FeedbackWidget" apps/web/src/app/\(dashboard\)/layout.tsx

# 8. Typecheck
pnpm --filter web typecheck
```

Expected:
- `messages/` contains `en.json` and `ar.json`
- `i18n/` contains `request.ts` and `navigation.ts`
- `currency.ts` has `formatCurrency` function
- `.env.example` has >= 8 `NEXT_PUBLIC_FF_` vars
- `package.json` lists `posthog-js`
- `feedback-widget.tsx` > 80 lines
- layout grep returns 3 matches
- typecheck passes
