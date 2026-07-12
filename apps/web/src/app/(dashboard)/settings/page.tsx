'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SETUP_CATEGORIES } from '@/config/setup-registry';

export default function SetupLandingPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold text-on-surface">Setup</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Every configuration and administration surface for Nexus, organized in one place.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {SETUP_CATEGORIES.map((category) => {
          const CatIcon = category.icon;
          return (
            <section
              key={category.id}
              className="flex flex-col rounded-2xl border border-outline-variant bg-surface p-5"
            >
              <div className="mb-3 flex items-start gap-3">
                <span className="rounded-xl bg-primary-container p-2.5 text-on-primary-container">
                  <CatIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-on-surface">{category.label}</h2>
                  <p className="mt-0.5 text-xs text-on-surface-variant">{category.description}</p>
                </div>
              </div>

              <ul className="mt-1 space-y-0.5">
                {category.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-on-surface-variant group-hover:text-primary" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.isNew ? (
                          <span className="rounded bg-tertiary-container px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-tertiary-container">
                            new
                          </span>
                        ) : null}
                        {item.external ? (
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
