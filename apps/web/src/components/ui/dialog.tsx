'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DialogIdsContextValue {
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);
const DialogIdsContext = createContext<DialogIdsContextValue | null>(null);

function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('Dialog components must be used within Dialog');
  }
  return context;
}

export function Dialog({
  open,
  onOpenChange,
  children,
}: DialogContextValue & { children: ReactNode }) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useDialog();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      // Focus trap (UX-34): keep Tab / Shift+Tab cycling inside the dialog.
      if (event.key === 'Tab' && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || !contentRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    contentRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          'relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-outline-variant bg-surface p-6 shadow-xl outline-none',
          className
        )}
        {...props}
      >
        <DialogIdsContext.Provider value={{ titleId, descriptionId }}>
          {children}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-md p-1 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface-variant"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogIdsContext.Provider>
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const ids = useContext(DialogIdsContext);
  return (
    <h2
      id={ids?.titleId}
      className={cn('text-lg font-semibold text-on-surface', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const ids = useContext(DialogIdsContext);
  return (
    <p
      id={ids?.descriptionId}
      className={cn('text-sm text-on-surface-variant', className)}
      {...props}
    />
  );
}
