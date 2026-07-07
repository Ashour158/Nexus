import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

/**
 * Follow / feed hooks — wire to crm-service social endpoints:
 *   - POST   /:entity/:id/follow      (toggle-on)
 *   - DELETE /:entity/:id/follow      (toggle-off)
 *   - GET    /:entity/:id/followers   → [{ userId, ... }]
 *   - GET    /me/following?entityType=account|contact
 *   - GET    /me/feed?limit=
 *
 * Endpoints may 404 until the backend deploys; queries degrade to empty
 * arrays rather than throwing so the UI never crashes.
 */

export type FollowEntityType = 'account' | 'contact';

export interface Follower {
  userId: string;
  [key: string]: unknown;
}

export interface FollowedRecord {
  id: string;
  entityType?: FollowEntityType;
  entityId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface FeedActivity {
  id: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  type?: string;
  title?: string;
  description?: string;
  at?: string;
  createdAt?: string;
  actorName?: string;
  [key: string]: unknown;
}

function pluralize(entityType: FollowEntityType): string {
  return entityType === 'account' ? 'accounts' : 'contacts';
}

export const followKeys = {
  all: ['follow'] as const,
  followers: (entityType: FollowEntityType, id: string) =>
    [...followKeys.all, entityType, id, 'followers'] as const,
  following: (entityType: FollowEntityType) =>
    [...followKeys.all, 'following', entityType] as const,
  feed: (limit: number) => [...followKeys.all, 'feed', limit] as const,
};

/** Followers of a single record. Returns [] on 404 / error. */
export function useFollowers(entityType: FollowEntityType, id: string) {
  return useQuery<Follower[]>({
    queryKey: followKeys.followers(entityType, id),
    queryFn: async () => {
      try {
        return await api.get<Follower[]>(`/${pluralize(entityType)}/${id}/followers`);
      } catch {
        return [];
      }
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** Records the current user follows, by entity type. Returns [] on 404 / error. */
export function useFollowing(entityType: FollowEntityType) {
  return useQuery<FollowedRecord[]>({
    queryKey: followKeys.following(entityType),
    queryFn: async () => {
      try {
        return await api.get<FollowedRecord[]>('/me/following', {
          params: { entityType },
        });
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });
}

/** Recent activity across records the current user follows. */
export function useFeed(limit = 50) {
  return useQuery<FeedActivity[]>({
    queryKey: followKeys.feed(limit),
    queryFn: async () => {
      try {
        return await api.get<FeedActivity[]>('/me/feed', { params: { limit } });
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
  });
}

interface ToggleVars {
  entityType: FollowEntityType;
  id: string;
  follow: boolean;
}

/** Toggles follow state for a record (POST to follow, DELETE to unfollow). */
export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, ToggleVars>({
    mutationFn: ({ entityType, id, follow }) => {
      const url = `/${pluralize(entityType)}/${id}/follow`;
      return follow ? api.post<unknown>(url) : api.delete<unknown>(url);
    },
    onSuccess: (_data, { entityType, id }) => {
      qc.invalidateQueries({ queryKey: followKeys.followers(entityType, id) });
      qc.invalidateQueries({ queryKey: followKeys.following(entityType) });
      qc.invalidateQueries({ queryKey: [...followKeys.all, 'feed'] });
    },
  });
}
