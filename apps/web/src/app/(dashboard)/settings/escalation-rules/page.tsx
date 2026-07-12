'use client';

import { Clock } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function EscalationRulesPage() {
  return (
    <SetupResourceList
      title="Escalation Rules"
      description="Escalate records and SLAs to managers when they breach time-based thresholds."
      icon={Clock}
      endpoint="/bff/workflow/escalation-rules"
      emptyHint="Add an escalation rule to notify or reassign records that miss their SLA."
      columns={[
        { key: 'name', label: 'Rule' },
        { key: 'module', label: 'Module' },
        { key: 'thresholdMinutes', label: 'Threshold (min)' },
        { key: 'isActive', label: 'Active' },
      ]}
    />
  );
}
