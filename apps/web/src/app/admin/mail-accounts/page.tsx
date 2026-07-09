import { AdminPlaceholder } from '@/components/admin/AdminPlaceholder';

export default function MailAccountsAdminPage() {
  return (
    <AdminPlaceholder
      title="Mail Accounts"
      description="Shared and team mailboxes plus outbound sending domains."
      relatedHref="/settings/integrations"
      relatedLabel="Open Integrations"
    />
  );
}
