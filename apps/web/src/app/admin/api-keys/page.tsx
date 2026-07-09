import { AdminPlaceholder } from '@/components/admin/AdminPlaceholder';

export default function ApiKeysAdminPage() {
  return (
    <AdminPlaceholder
      title="API Keys"
      description="Programmatic API keys, scopes, and rotation."
      relatedHref="/settings/integrations/webhooks"
      relatedLabel="Open Webhooks"
    />
  );
}
