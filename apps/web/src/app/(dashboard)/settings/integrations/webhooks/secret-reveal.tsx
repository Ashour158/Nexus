'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * One-time signing-secret reveal with copy-to-clipboard and a "save this now"
 * warning. The secret is only returned once by the API (on create / rotate),
 * so this makes it obvious the user must copy it before dismissing.
 */
export function SecretReveal({ secret }: { secret: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can still reveal + copy manually */
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-container p-3">
      <div className="flex items-start gap-2 text-on-warning-container">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs font-medium">
          Save this signing secret now — it is shown only once and cannot be
          retrieved later.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-warning/30 bg-surface px-2 py-1.5 font-mono text-xs text-on-surface">
          {visible ? secret : '•'.repeat(Math.min(secret.length, 40))}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide secret' : 'Reveal secret'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
