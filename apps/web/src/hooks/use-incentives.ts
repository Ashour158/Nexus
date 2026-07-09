import { useQuery } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

/**
 * React Query hooks for the Incentives domain (contests + badges).
 */

export interface Contest {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  metric: string;
  targetValue?: string | number | null;
  startDate: string;
  endDate: string;
  prizeDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Badge {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  criteriaType: string;
  criteriaValue?: number | null;
  createdAt: string;
}

export interface MyBadge {
  id: string;
  badgeId: string;
  userId: string;
  awardedAt: string;
  badge?: Badge;
}

export const incentiveKeys = {
  all: ['incentives'] as const,
  contests: () => [...incentiveKeys.all, 'contests'] as const,
  badges: () => [...incentiveKeys.all, 'badges'] as const,
  myBadges: (userId: string) => [...incentiveKeys.all, 'myBadges', userId] as const,
};

export function useContests() {
  return useQuery<Contest[]>({
    queryKey: incentiveKeys.contests(),
    queryFn: () => apiClients.incentive.get<Contest[]>('/contests'),
    staleTime: 60_000,
  });
}

export function useBadges() {
  return useQuery<Badge[]>({
    queryKey: incentiveKeys.badges(),
    queryFn: () => apiClients.incentive.get<Badge[]>('/badges'),
    staleTime: 60_000,
  });
}

export function useMyBadges(userId: string) {
  return useQuery<MyBadge[]>({
    queryKey: incentiveKeys.myBadges(userId),
    queryFn: () => apiClients.incentive.get<MyBadge[]>('/badges/mine'),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
