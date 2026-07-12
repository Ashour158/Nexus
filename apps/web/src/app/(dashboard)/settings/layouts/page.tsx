'use client';

import { LayoutGrid } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function PageLayoutsPage() {
  return (
    <SetupResourceList
      title="Page Layouts & Layout Rules"
      description="Per-module record page layouts and dynamic layout rules that show or hide sections."
      icon={LayoutGrid}
      endpoint="/bff/metadata/layouts"
      emptyHint="Define a page layout for a module to control field arrangement and layout rules."
      columns={[
        { key: 'name', label: 'Layout' },
        { key: 'module', label: 'Module' },
        { key: 'isDefault', label: 'Default' },
        {
          key: 'rules',
          label: 'Layout Rules',
          render: (row) =>
            Array.isArray(row.rules) ? `${(row.rules as unknown[]).length} rules` : '—',
        },
      ]}
    />
  );
}
