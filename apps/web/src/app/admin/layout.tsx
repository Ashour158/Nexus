'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/stores/auth.store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const roles = useAuthStore((s) => s.roles ?? []);
  const [hydrated, setHydrated] = useState(false);
  const isAdmin = roles.some((role) => role.toLowerCase() === 'admin');

  useEffect(() => {
    setHydrated(useAuthStore.persist?.hasHydrated?.() ?? true);
    const unsubscribe = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (hydrated && !isAdmin) {
      router.replace('/');
    }
  }, [hydrated, isAdmin, router]);

  if (!hydrated || !isAdmin) {
    return <div className="p-8 text-sm text-gray-300">Redirecting...</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-white">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-gray-950">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
