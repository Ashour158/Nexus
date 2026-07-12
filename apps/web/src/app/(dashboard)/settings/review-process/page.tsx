'use client';

import { GitPullRequest } from 'lucide-react';
import { SetupResourceList } from '@/components/settings/setup-resource-list';

export default function ReviewProcessPage() {
  return (
    <SetupResourceList
      title="Review Process"
      description="Maker-checker review configuration. Queue new or edited records for approval before they go live."
      icon={GitPullRequest}
      endpoint="/bff/crm/review/config"
      emptyHint="Enable a review process on a module to route record changes through a reviewer."
      columns={[
        { key: 'module', label: 'Module' },
        { key: 'enabled', label: 'Enabled' },
        { key: 'reviewerRole', label: 'Reviewer Role' },
        { key: 'appliesTo', label: 'Applies To' },
      ]}
    />
  );
}
