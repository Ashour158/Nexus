'use client';

import { useMemo } from 'react';
import { Check, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import {
  useFollowers,
  useToggleFollow,
  type FollowEntityType,
} from '@/hooks/use-follow';

/**
 * Follow / Following toggle for an account or contact.
 *
 * Reads the record's followers list to derive whether the current user
 * already follows it, then POSTs/DELETEs to toggle. Degrades quietly when
 * the endpoint is unavailable (followers query returns []).
 */
export function FollowButton({
  entityType,
  entityId,
}: {
  entityType: FollowEntityType;
  entityId: string;
}) {
  const userId = useAuthStore((s) => s.userId);
  const followersQuery = useFollowers(entityType, entityId);
  const toggle = useToggleFollow();

  const isFollowing = useMemo(() => {
    if (!userId) return false;
    return (followersQuery.data ?? []).some((f) => f.userId === userId);
  }, [followersQuery.data, userId]);

  const handleClick = () => {
    toggle.mutate({ entityType, id: entityId, follow: !isFollowing });
  };

  return (
    <Button
      variant={isFollowing ? 'secondary' : 'primary'}
      onClick={handleClick}
      isLoading={toggle.isPending}
      aria-pressed={isFollowing}
    >
      {isFollowing ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  );
}
