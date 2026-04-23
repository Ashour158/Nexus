import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** Native `<select>` styled to match the rest of the form primitives. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ invalid, className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
