import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a small spinner and disables the button while truthy. */
  isLoading?: boolean;
  /** Stretches the button to fill its container. */
  fullWidth?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm shadow-primary/20 hover:opacity-90',
  secondary:
    'border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high',
  outline:
    'border border-outline-variant bg-transparent text-on-surface hover:bg-surface-container-high',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
  danger: 'bg-error text-on-error hover:opacity-90',
  destructive:
    'bg-destructive text-destructive-foreground hover:opacity-90',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'h-10 px-4 text-base',
};

/** Styled button with built-in loading state (Section 53). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) {
    const isDisabled = disabled || isLoading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
          'disabled:cursor-not-allowed disabled:opacity-60',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {children}
      </button>
    );
  }
);
