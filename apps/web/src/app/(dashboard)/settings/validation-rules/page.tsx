'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ValidationRulesSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/validation-rules');
  }, [router]);

  return (
    <div className="p-6 text-sm text-slate-500">
      Field validation policy is admin controlled. Redirecting to the admin panel...
    </div>
  );
}
