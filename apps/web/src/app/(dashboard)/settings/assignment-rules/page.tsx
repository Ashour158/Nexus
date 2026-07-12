'use client';

import { Route } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function AssignmentRulesPage() {
  return (
    <SetupResourceList
      title="Assignment Rules"
      description="Automatically route incoming leads and records to owners using round-robin or criteria-based rules."
      icon={Route}
      endpoint="/bff/crm/assignment-rules"
      emptyHint="Create an assignment rule to auto-distribute new records across your team."
      columns={[
        { key: 'name', label: 'Rule' },
        { key: 'module', label: 'Module' },
        { key: 'strategy', label: 'Strategy' },
        { key: 'isActive', label: 'Active' },
      ]}
    />
  );
}
