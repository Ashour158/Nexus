'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useCompany, useUpsertCompany, type CompanyUpsert } from '@/hooks/use-org';

const EMPTY: CompanyUpsert = {
  name: '',
  legalName: '',
  domain: '',
  logoUrl: '',
  industry: '',
  size: '',
  phone: '',
  website: '',
  street: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  timezone: '',
  currency: '',
};

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5] disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant';

export default function CompanyProfilePage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('settings:read');
  const canEdit = hasPermission('settings:update');

  const { data: company, isLoading, isError, error } = useCompany();
  const upsert = useUpsertCompany();

  const [form, setForm] = useState<CompanyUpsert>(EMPTY);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? '',
        legalName: company.legalName ?? '',
        domain: company.domain ?? '',
        logoUrl: company.logoUrl ?? '',
        industry: company.industry ?? '',
        size: company.size ?? '',
        phone: company.phone ?? '',
        website: company.website ?? '',
        street: company.street ?? '',
        city: company.city ?? '',
        state: company.state ?? '',
        country: company.country ?? '',
        postalCode: company.postalCode ?? '',
        timezone: company.timezone ?? '',
        currency: company.currency ?? '',
      });
    }
  }, [company]);

  function set<K extends keyof CompanyUpsert>(key: K, value: CompanyUpsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setBanner(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBanner(null);
    // Normalize empty strings to undefined so optional fields aren't stored blank.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v])
    ) as CompanyUpsert;
    if (!payload.name) {
      setBanner({ kind: 'err', text: 'Company name is required.' });
      return;
    }
    try {
      await upsert.mutateAsync(payload);
      setBanner({ kind: 'ok', text: 'Company profile saved.' });
    } catch (err) {
      setBanner({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    }
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-warning/30 bg-warning-container px-4 py-3 text-sm text-on-warning-container">
          You do not have permission to view the company profile (requires settings:read).
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-[#4f46e5]">
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Company Profile</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Your organization&apos;s identity, contact details, and localization.
          </p>
        </div>
      </div>

      {banner ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-success/30 bg-success-container text-on-success-container'
              : 'border-error/30 bg-error-container text-on-error-container'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {isError ? (
        <div className="mb-4 rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Failed to load company: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-sm text-on-surface-variant">
          Loading company profile…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <fieldset disabled={!canEdit} className="space-y-6">
            <section className="rounded-xl border border-outline-variant bg-surface p-5">
              <div className="mb-4 flex items-center gap-4">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt="Company logo"
                    className="h-14 w-14 rounded-lg border border-outline-variant object-contain"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-outline-variant text-on-surface-variant">
                    <Building2 className="h-6 w-6" />
                  </span>
                )}
                <div className="flex-1">
                  <Field label="Logo URL">
                    <input
                      className={inputClass}
                      value={form.logoUrl ?? ''}
                      onChange={(e) => set('logoUrl', e.target.value)}
                      placeholder="https://…/logo.png"
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company name *">
                  <input
                    className={inputClass}
                    required
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </Field>
                <Field label="Legal name">
                  <input
                    className={inputClass}
                    value={form.legalName ?? ''}
                    onChange={(e) => set('legalName', e.target.value)}
                  />
                </Field>
                <Field label="Domain">
                  <input
                    className={inputClass}
                    value={form.domain ?? ''}
                    onChange={(e) => set('domain', e.target.value)}
                    placeholder="example.com"
                  />
                </Field>
                <Field label="Website">
                  <input
                    className={inputClass}
                    value={form.website ?? ''}
                    onChange={(e) => set('website', e.target.value)}
                    placeholder="https://example.com"
                  />
                </Field>
                <Field label="Industry">
                  <input
                    className={inputClass}
                    value={form.industry ?? ''}
                    onChange={(e) => set('industry', e.target.value)}
                  />
                </Field>
                <Field label="Company size">
                  <select
                    className={inputClass}
                    value={form.size ?? ''}
                    onChange={(e) => set('size', e.target.value)}
                  >
                    <option value="">Select size…</option>
                    {SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} employees
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Phone">
                  <input
                    className={inputClass}
                    value={form.phone ?? ''}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-on-surface">Address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Street">
                    <input
                      className={inputClass}
                      value={form.street ?? ''}
                      onChange={(e) => set('street', e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={form.city ?? ''}
                    onChange={(e) => set('city', e.target.value)}
                  />
                </Field>
                <Field label="State / Region">
                  <input
                    className={inputClass}
                    value={form.state ?? ''}
                    onChange={(e) => set('state', e.target.value)}
                  />
                </Field>
                <Field label="Country">
                  <input
                    className={inputClass}
                    value={form.country ?? ''}
                    onChange={(e) => set('country', e.target.value)}
                  />
                </Field>
                <Field label="Postal code">
                  <input
                    className={inputClass}
                    value={form.postalCode ?? ''}
                    onChange={(e) => set('postalCode', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-xl border border-outline-variant bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold text-on-surface">Localization</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Timezone">
                  <input
                    className={inputClass}
                    value={form.timezone ?? ''}
                    onChange={(e) => set('timezone', e.target.value)}
                    placeholder="e.g. Asia/Riyadh"
                  />
                </Field>
                <Field label="Currency">
                  <input
                    className={inputClass}
                    value={form.currency ?? ''}
                    onChange={(e) => set('currency', e.target.value)}
                    placeholder="e.g. SAR"
                  />
                </Field>
              </div>
            </section>
          </fieldset>

          {canEdit ? (
            <div className="flex items-center justify-end gap-3">
              <Button type="submit" isLoading={upsert.isPending} className="bg-[#4f46e5] hover:bg-[#0f6fd4]">
                Save changes
              </Button>
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">
              You have read-only access. Editing requires the settings:update permission.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
