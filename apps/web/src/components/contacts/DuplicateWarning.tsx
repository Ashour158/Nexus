'use client';

interface DuplicateWarningProps {
  visible: boolean;
  name: string;
  company: string;
  email: string;
  onView?: () => void;
  onContinue?: () => void;
  onMerge?: () => void;
}

export function DuplicateWarning({ visible, name, company, email, onView, onContinue, onMerge }: DuplicateWarningProps) {
  if (!visible) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>?? Similar contact found: "{name}" at {company} ({email})</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={onView} className="rounded border border-amber-400 px-2 py-1 text-xs">View existing contact</button>
        <button onClick={onContinue} className="rounded border border-amber-400 px-2 py-1 text-xs">Continue creating new</button>
        <button onClick={onMerge} className="rounded bg-amber-600 px-2 py-1 text-xs text-white">Merge</button>
      </div>
    </div>
  );
}
