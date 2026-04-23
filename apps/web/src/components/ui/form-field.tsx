import { useId, type ReactNode } from 'react';
import { Label } from './label';
import { cn } from '@/lib/cn';

interface FormFieldProps {
  label: string;
  /** Render-prop that receives an id to bind to the control's `id`. */
  children: (props: { id: string; describedBy?: string }) => ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

/**
 * Accessible label + control + error/hint wrapper.
 *
 * The inner control is rendered via a render-prop so the `id` / `aria-describedby`
 * plumbing can be applied to any primitive (`Input`, `Select`, `Textarea`,
 * custom widgets like `Combobox` / `MultiSelect`) without imposing a
 * component-specific API.
 */
export function FormField({
  label,
  children,
  error,
  hint,
  required,
  className,
}: FormFieldProps): JSX.Element {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
