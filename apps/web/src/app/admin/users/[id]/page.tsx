import { redirect } from 'next/navigation';

// Folded into the unified Setup area. Kept so the old /admin URL never 404s.
export default function AdminUserDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/settings/users/${params.id}`);
}
