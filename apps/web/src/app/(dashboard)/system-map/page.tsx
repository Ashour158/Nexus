'use client';

import Link from 'next/link';
import { CRM_MODULE_GROUPS, CRM_MODULES, CRM_SERVICE_NAMES, type ModuleStatus } from '@/config/module-registry';
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge';

const statusVariant: Record<ModuleStatus, StatusVariant> = {
  ready: 'success',
  wired: 'info',
  preview: 'warning',
  'needs-backend': 'danger',
};

const statusLabel: Record<ModuleStatus, string> = {
  ready: 'Ready',
  wired: 'Wired',
  preview: 'Preview',
  'needs-backend': 'Needs backend',
};

export default function SystemMapPage() {
  const surfaced = CRM_MODULES.filter((module) => module.sidebar).length;
  const needingBackend = CRM_MODULES.filter((module) => module.status === 'needs-backend').length;

  return (
    <main className="space-y-6 px-6 py-6">
      <header className="border-b border-outline-variant pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Nexus CRM operating map</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">System Map</h1>
            <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
              The full module registry for the CRM: every major feature area, the service that powers it,
              what has depth already, and what still needs backend hardening.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Modules" value={CRM_MODULES.length} />
            <Metric label="Surfaced" value={surfaced} />
            <Metric label="Services" value={CRM_SERVICE_NAMES.length} />
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Summary label="Ready/Wired" value={CRM_MODULES.filter((m) => m.status === 'ready' || m.status === 'wired').length} />
        <Summary label="Preview Ready" value={CRM_MODULES.filter((m) => m.status === 'preview').length} />
        <Summary label="Needs Backend" value={needingBackend} />
        <Summary label="Registry Groups" value={CRM_MODULE_GROUPS.length} />
      </section>

      <section className="space-y-6">
        {CRM_MODULE_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.id} className="border-t border-outline-variant pt-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-inverse-surface text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold text-on-surface">{group.label}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">{group.description}</p>
                  </div>
                </div>
                <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface">
                  {group.modules.length} modules
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {group.modules.map((module) => {
                  const ModuleIcon = module.icon;
                  return (
                    <article key={module.id} className="rounded-md border border-outline-variant bg-surface p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-container-high text-on-surface">
                            <ModuleIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <Link href={module.href} className="font-semibold text-on-surface hover:text-primary">
                              {module.label}
                            </Link>
                            <p className="mt-1 text-sm text-on-surface-variant">{module.description}</p>
                          </div>
                        </div>
                        <StatusBadge status={statusLabel[module.status]} variant={statusVariant[module.status]} />
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr]">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Service</p>
                          <p className="mt-1 text-sm text-on-surface">{module.service}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Feature Depth</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {module.depth.map((item) => (
                              <span key={item} className="rounded-full bg-surface-container-low px-2 py-1 text-xs text-on-surface">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-outline-variant bg-surface px-4 py-3 shadow-sm">
      <p className="text-2xl font-bold text-on-surface">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-outline-variant bg-surface p-4 shadow-sm">
      <p className="text-sm font-medium text-on-surface-variant">{label}</p>
      <p className="mt-2 text-3xl font-bold text-on-surface">{value}</p>
    </div>
  );
}
