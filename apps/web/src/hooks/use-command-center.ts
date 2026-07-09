'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

const api = apiClients.commandCenter;

// ---------------------------------------------------------------------------
// Types (mirror workflow-service CommandCenter journeys)
// ---------------------------------------------------------------------------

export type JourneyEntityType = 'lead' | 'contact' | 'account' | 'deal';
export type JourneyStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type JourneyStepType =
  | 'WAIT'
  | 'ACTION'
  | 'EMAIL'
  | 'CONDITION'
  | 'BRANCH'
  | 'GOAL'
  | 'EXIT';

export const JOURNEY_STEP_TYPES: JourneyStepType[] = [
  'WAIT',
  'ACTION',
  'EMAIL',
  'CONDITION',
  'BRANCH',
  'GOAL',
  'EXIT',
];

export const JOURNEY_ENTITY_TYPES: JourneyEntityType[] = ['lead', 'contact', 'account', 'deal'];

export interface JourneyStep {
  id: string;
  type: JourneyStepType;
  config: Record<string, unknown>;
  nextStepId?: string | null;
  branches?: { label: string; nextStepId?: string | null }[];
}

export interface JourneyEntryTrigger {
  event?: string;
  conditions?: Record<string, unknown>;
}

export interface Journey {
  id: string;
  name: string;
  description?: string;
  entityType: JourneyEntityType;
  status: JourneyStatus;
  entryTrigger: JourneyEntryTrigger;
  steps: JourneyStep[];
  exitCriteria?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyEnrollment {
  id: string;
  journeyId: string;
  entityType: JourneyEntityType;
  entityId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'EXITED';
  currentStepId?: string | null;
  context?: Record<string, unknown>;
  enrolledAt: string;
  exitedAt?: string | null;
}

export const ccKeys = {
  all: ['command-center'] as const,
  journeys: () => [...ccKeys.all, 'journeys'] as const,
  journey: (id: string) => [...ccKeys.all, 'journey', id] as const,
  enrollments: (id: string) => [...ccKeys.all, 'enrollments', id] as const,
};

export function useJourneys() {
  return useQuery<Journey[]>({
    queryKey: ccKeys.journeys(),
    queryFn: () => api.get<Journey[]>('/journeys'),
  });
}

export function useJourney(journeyId: string | undefined) {
  return useQuery<Journey>({
    queryKey: ccKeys.journey(journeyId ?? ''),
    queryFn: () => api.get<Journey>(`/journeys/${journeyId}`),
    enabled: Boolean(journeyId),
  });
}

export function useCreateJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Journey>) => api.post<Journey>('/journeys', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ccKeys.journeys() }),
  });
}

export function useUpdateJourney(journeyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Journey>) => api.patch<Journey>(`/journeys/${journeyId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ccKeys.journeys() });
      qc.invalidateQueries({ queryKey: ccKeys.journey(journeyId) });
    },
  });
}

export function useDeleteJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (journeyId: string) => api.delete<{ deleted: boolean }>(`/journeys/${journeyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ccKeys.journeys() }),
  });
}

export function useActivateJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (journeyId: string) => api.post<Journey>(`/journeys/${journeyId}/activate`),
    onSuccess: (_data, journeyId) => {
      qc.invalidateQueries({ queryKey: ccKeys.journeys() });
      qc.invalidateQueries({ queryKey: ccKeys.journey(journeyId) });
    },
  });
}

export function useArchiveJourney() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (journeyId: string) => api.post<Journey>(`/journeys/${journeyId}/archive`),
    onSuccess: (_data, journeyId) => {
      qc.invalidateQueries({ queryKey: ccKeys.journeys() });
      qc.invalidateQueries({ queryKey: ccKeys.journey(journeyId) });
    },
  });
}

export function useJourneyEnrollments(journeyId: string | undefined) {
  return useQuery<JourneyEnrollment[]>({
    queryKey: ccKeys.enrollments(journeyId ?? ''),
    queryFn: () => api.get<JourneyEnrollment[]>(`/journeys/${journeyId}/enrollments`),
    enabled: Boolean(journeyId),
  });
}

export function useEnrollInJourney(journeyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { entityType?: JourneyEntityType; entityId: string; context?: Record<string, unknown> }) =>
      api.post<JourneyEnrollment>(`/journeys/${journeyId}/enroll`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ccKeys.enrollments(journeyId) }),
  });
}
