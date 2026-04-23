'use client';

import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Maximum length for a single tag. Defaults to 40. */
  maxTagLength?: number;
}

/**
 * Free-form tag input — type a value and press Enter (or `,`) to commit it
 * as a chip. Backspace on an empty input removes the last chip.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder = 'Type and press Enter…',
  disabled = false,
  invalid = false,
  describedBy,
  maxTagLength = 40,
}: TagInputProps): JSX.Element {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const trimmed = raw.trim().slice(0, maxTagLength);
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm',
        'focus-within:ring-2 focus-within:ring-primary',
        invalid && 'border-destructive focus-within:ring-destructive',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${tag}`}
            onClick={() => remove(tag)}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => draft && commit(draft)}
        className="min-w-[8ch] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
