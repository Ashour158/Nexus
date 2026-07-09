'use client';

/**
 * Canonical confirm-dialog surface for the app.
 *
 * The implementation lives in `@/hooks/use-confirm` (built on the accessible
 * `Dialog` primitive with focus trapping + Escape handling). This module is the
 * standardized import site so callers don't reach into `hooks/` directly and so
 * native `window.confirm(...)` calls have one place to migrate to.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   const ok = await confirm({ title: 'Delete', description: '…', confirmLabel: 'Delete', danger: true });
 *   // render {ConfirmDialog} somewhere in the tree
 */
export { useConfirm, usePrompt } from '@/hooks/use-confirm';
export type { ConfirmOptions } from '@/hooks/use-confirm';
