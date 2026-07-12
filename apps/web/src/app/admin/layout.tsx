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
    // The auth store uses `skipHydration: true`, so it only populates after an
    // explicit rehydrate(). /admin/* lives outside the (dashboard) group and its
    // HydrationGate, so if we don't rehydrate here `hasHydrated()` stays false
    // forever and every admin page is stuck on "Redirecting…" (blank panel).
    void useAuthStore.persist?.rehydrate?.();
    if (useAuthStore.persist?.hasHydrated?.()) {
      setHydrated(true);
    }
    const unsubscribe = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (hydrated && !isAdmin) {
      router.replace('/');
    }
  }, [hydrated, isAdmin, router]);

  if (!hydrated || !isAdmin) {
    return <div className="p-8 text-sm text-outline">Redirecting...</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-inverse-surface text-white">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-inverse-surface">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
