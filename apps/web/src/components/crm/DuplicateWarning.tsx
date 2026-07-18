'use client';

import { useEffect, useRef, useState } from 'react';

interface Duplicate {
  id: string;
  type: 'CONTACT' | 'LEAD' | 'ACCOUNT';
  name: string;
  email?: string;
  company?: string;
  score: number;
}

interface DuplicateWarningProps {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  type: 'contact' | 'lead';
}

export function DuplicateWarning({ email, phone, firstName, lastName, type }: DuplicateWarningProps) {
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hasInput = email || phone || (firstName && lastName);
    if (!hasInput) {
      setDuplicates([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (phone) params.set('phone', phone);
        if (firstName) params.set('firstName', firstName);
        if (lastName) params.set('lastName', lastName);
        params.set('type', type);
        const res = await fetch(`/api/crm/duplicates/check?${params.toString()}`);
        const data = await res.json();
        setDuplicates(data.duplicates || []);
      } catch {
        setDuplicates([]);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, phone, firstName, lastName, type]);

  if (checking) return <p className="mt-1 text-xs text-on-surface-variant">Checking for duplicates...</p>;
  if (duplicates.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-warning/30 bg-warning-container p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-warning">⚠️</span>
        <p className="text-sm font-medium text-on-warning-container">
          {duplicates.length} possible duplicate{duplicates.length > 1 ? 's' : ''} found
        </p>
      </div>
      <div className="space-y-1">
        {duplicates.map((dup) => (
          <a
            key={dup.id}
            href={`/${type === 'contact' ? 'contacts' : 'leads'}/${dup.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded border border-warning/30 bg-surface p-2 text-xs transition-colors hover:border-warning/40"
          >
            <span className="font-medium text-on-surface">{dup.name}</span>
            <span className="text-on-surface-variant">{dup.email}</span>
            <span className="font-medium text-warning">{dup.score}% match</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs text-warning">Review these before creating a new record</p>
    </div>
  );
}
