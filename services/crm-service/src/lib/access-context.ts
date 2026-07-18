import type { JwtPayload } from '@nexus/shared-types';
import { resolveRecordScope, applyOwnershipScope } from '@nexus/service-utils';
import { resolveTeamMemberIds } from './team-resolver.js';

/**
 * Read-side access context assembled per request for the core sales objects.
 *
 * `ownershipWhere` is a Prisma-compatible `where` fragment produced by
 * {@link applyOwnershipScope} from the caller's resolved {@link RecordScope}:
 *   - scope 'all'  → {}                          (no ownership restriction)
 *   - scope 'own'  → { ownerId: <caller> }
 *   - scope 'team' → { ownerId: { in: [...] } }  (caller + direct reports)
 *   - scope null   → { ownerId: '__none__' }     (no access ⇒ matches nothing)
 *
 * This fragment is intersected INTO (never replaces) each list query's existing
 * tenantId + filter constraints, so tenant RLS and explicit `ownerId` filters
 * are preserved.
 */
export interface CrmReadAccessContext {
  ownershipWhere: Record<string, unknown>;
  roles: string[];
}

/**
 * Compute the ownership-scope `where` fragment for `<resource>:read` and the
 * caller's roles (for field-level read masking).
 *
 * Team-scope membership is resolved from auth-service; if that resolution is
 * unavailable it fails closed to the caller's own id (see {@link resolveTeamMemberIds}).
 *
 * @param jwt       the authenticated caller
 * @param resource  the object being read: 'deal' | 'lead' | 'contact' | 'account'
 * @param token     the caller's Authorization header, forwarded for team resolution
 */
export async function buildReadAccessContext(
  jwt: JwtPayload,
  resource: 'deal' | 'lead' | 'contact' | 'account',
  token?: string
): Promise<CrmReadAccessContext> {
  const permission = `${resource}s:read`;
  const scope = resolveRecordScope(jwt.permissions ?? [], permission);

  let teamMemberIds: string[] | undefined;
  if (scope === 'team') {
    teamMemberIds = await resolveTeamMemberIds(jwt.sub, token, jwt.tenantId);
  }

  const ownershipWhere = applyOwnershipScope(scope, {
    userId: jwt.sub,
    teamMemberIds,
  });

  return { ownershipWhere, roles: jwt.roles ?? [] };
}
