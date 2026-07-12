'use client';

import { Compass } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function BlueprintTransitionsPage() {
  return (
    <SetupResourceList
      title="Blueprint Transitions"
      description="State-machine blueprints that gate record progression and enforce required steps between stages."
      icon={Compass}
      endpoint="/bff/blueprint/blueprints"
      emptyHint="Define a blueprint to control the allowed transitions between record stages."
      columns={[
        { key: 'name', label: 'Blueprint' },
        { key: 'module', label: 'Module' },
        {
          key: 'transitions',
          label: 'Transitions',
          render: (row) =>
            Array.isArray(row.transitions)
              ? `${(row.transitions as unknown[]).length} transitions`
              : '—',
        },
        { key: 'isActive', label: 'Active' },
      ]}
    />
  );
}
