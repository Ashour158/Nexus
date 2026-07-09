/**
 * Deal follow hooks — thin deal-scoped facade over the entity-generic
 * `use-follow` hooks. The underlying REST surface is identical to accounts /
 * contacts, just pluralized to `deals`:
 *   - POST   /deals/:id/follow      (201, idempotent)
 *   - DELETE /deals/:id/follow
 *   - GET    /deals/:id/followers   → [{ userId, ... }]
 *
 * Endpoints may 404 until crm-service deploys the deal-follow routes; the
 * followers query degrades to [] so the UI never crashes.
 */
import { useFollowers, useToggleFollow, type Follower } from '@/hooks/use-follow';

/** Followers of a single deal. Returns [] on 404 / error. */
export function useDealFollowers(dealId: string) {
  return useFollowers('deal', dealId);
}

/** Toggle helper bound to the deal entity type. */
export function useToggleDealFollow() {
  return useToggleFollow();
}

export type { Follower };
