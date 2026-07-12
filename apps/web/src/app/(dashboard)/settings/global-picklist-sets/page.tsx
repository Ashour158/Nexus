'use client';

import { List } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function GlobalPicklistSetsPage() {
  return (
    <SetupResourceList
      title="Global Picklist Sets"
      description="Reusable sets of picklist values shared across custom fields and modules."
      icon={List}
      endpoint="/bff/metadata/global-sets"
      emptyHint="Create a global picklist set to reuse the same values across multiple fields."
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'apiName', label: 'API Name' },
        {
          key: 'values',
          label: 'Values',
          render: (row) =>
            Array.isArray(row.values) ? `${(row.values as unknown[]).length} values` : '—',
        },
        { key: 'usageCount', label: 'Used By' },
      ]}
    />
  );
}
