import { AdminPlaceholder } from '@/components/admin/AdminPlaceholder';

export default function AutomationRulesAdminPage() {
  return (
    <AdminPlaceholder
      title="Automation Rules"
      description="Event-driven automation rules — record assignment, notifications, and field updates."
      relatedHref="/workflows"
      relatedLabel="Open Workflows"
    />
  );
}
