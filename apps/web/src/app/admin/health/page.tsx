import { redirect } from 'next/navigation';

// Folded into the unified Setup area. Kept so the old /admin URL never 404s.
export default function AdminRedirect() {
  redirect('/settings/health');
}
