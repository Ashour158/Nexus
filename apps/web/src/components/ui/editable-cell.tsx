'use client';

import { useState, useRef, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function EditableCell({
  value,
  onSave,
  className,
  inputClassName,
  disabled = false,
  children,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, value]);

  const commit = useCallback(async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <div className={cn('relative inline-flex w-full items-center', className)}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          disabled={saving}
          className={cn(
            'w-full rounded border px-2 py-1 text-sm outline-none focus:border-primary',
            saving && 'opacity-60',
            inputClassName
          )}
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
        />
        {saving ? <Loader2 className="absolute end-1 h-3.5 w-3.5 animate-spin text-gray-400" /> : null}
      </div>
    );
  }

  return (
    <span
      onDoubleClick={startEdit}
      className={cn('cursor-text rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-slate-800', className)}
      title="Double-click to edit"
    >
      {children}
    </span>
  );
}

interface EditableSelectCellProps<T extends string> {
  value: T;
  options: { label: string; value: T }[];
  onSave: (value: T) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function EditableSelectCell<T extends string>({
  value,
  options,
  onSave,
  className,
  disabled = false,
  children,
}: EditableSelectCellProps<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(value);
  const [saving, setSaving] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  const startEdit = useCallback(() => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
    setTimeout(() => selectRef.current?.focus(), 0);
  }, [disabled, value]);

  const commit = useCallback(async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value as T);
        }}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        disabled={saving}
        className={cn(
          'w-full rounded border px-2 py-1 text-sm outline-none focus:border-primary',
          saving && 'opacity-60',
          className
        )}
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span
      onDoubleClick={startEdit}
      className={cn('cursor-text rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-slate-800', className)}
      title="Double-click to edit"
    >
      {children}
    </span>
  );
}
