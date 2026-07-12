import { redirect } from 'next/navigation';

// The Admin panel is now the unified Setup area.
export default function AdminIndexRedirect() {
  redirect('/settings');
}
