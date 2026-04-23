import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Adds a red asterisk after the label text. */
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { children, required, className, ...props },
  ref
) {
  return (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none text-foreground',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
    </label>
  );
});
