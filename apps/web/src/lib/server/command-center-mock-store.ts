/**
 * In-memory dev-preview store for workflow-service CommandCenter journeys
 * (/api/v1/command-center/**). Backs the journey builder UI without a live
 * workflow-service. Persists across requests within a single dev process.
 */

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

interface CommandCenterState {
  journeys: Journey[];
  enrollments: JourneyEnrollment[];
}

const g = globalThis as unknown as { __nexusCommandCenterStore?: CommandCenterState };

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seed(): CommandCenterState {
  const journeyId = 'jny_onboarding';
  const ts = nowIso();
  const journey: Journey = {
    id: journeyId,
    name: 'New Customer Onboarding',
    description: 'Welcome and activate newly won accounts',
    entityType: 'account',
    status: 'ACTIVE',
    entryTrigger: { event: 'deal.won', conditions: {} },
    steps: [
      { id: 'step_welcome', type: 'EMAIL', config: { template: 'welcome', subject: 'Welcome aboard!' }, nextStepId: 'step_wait' },
      { id: 'step_wait', type: 'WAIT', config: { durationHours: 48 }, nextStepId: 'step_check' },
      { id: 'step_check', type: 'CONDITION', config: { field: 'activated', equals: true }, nextStepId: 'step_goal' },
      { id: 'step_goal', type: 'GOAL', config: { name: 'Activated' }, nextStepId: 'step_exit' },
      { id: 'step_exit', type: 'EXIT', config: {}, nextStepId: null },
    ],
    exitCriteria: { event: 'account.churned' },
    createdAt: ts,
    updatedAt: ts,
  };
  const enrollment: JourneyEnrollment = {
    id: id('enr'),
    journeyId,
    entityType: 'account',
    entityId: 'acc_demo_1',
    status: 'ACTIVE',
    currentStepId: 'step_wait',
    enrolledAt: ts,
  };
  return { journeys: [journey], enrollments: [enrollment] };
}

function store(): CommandCenterState {
  if (!g.__nexusCommandCenterStore) {
    g.__nexusCommandCenterStore = seed();
  }
  return g.__nexusCommandCenterStore;
}

export function listJourneys(): Journey[] {
  return store().journeys;
}

export function getJourney(journeyId: string): Journey | undefined {
  return store().journeys.find((j) => j.id === journeyId);
}

export function createJourney(input: Record<string, unknown>): Journey {
  const ts = nowIso();
  const journey: Journey = {
    id: id('jny'),
    name: String(input.name ?? 'Untitled Journey'),
    description: input.description ? String(input.description) : undefined,
    entityType: (input.entityType as JourneyEntityType) ?? 'contact',
    status: 'DRAFT',
    entryTrigger: (input.entryTrigger as JourneyEntryTrigger) ?? {},
    steps: (input.steps as JourneyStep[]) ?? [],
    exitCriteria: (input.exitCriteria as Record<string, unknown>) ?? undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  store().journeys.push(journey);
  return journey;
}

export function updateJourney(journeyId: string, patch: Record<string, unknown>): Journey | undefined {
  const journey = getJourney(journeyId);
  if (!journey) return undefined;
  Object.assign(journey, {
    name: patch.name !== undefined ? String(patch.name) : journey.name,
    description: patch.description !== undefined ? String(patch.description) : journey.description,
    entityType: patch.entityType !== undefined ? (patch.entityType as JourneyEntityType) : journey.entityType,
    entryTrigger: patch.entryTrigger !== undefined ? (patch.entryTrigger as JourneyEntryTrigger) : journey.entryTrigger,
    steps: patch.steps !== undefined ? (patch.steps as JourneyStep[]) : journey.steps,
    exitCriteria: patch.exitCriteria !== undefined ? (patch.exitCriteria as Record<string, unknown>) : journey.exitCriteria,
    updatedAt: nowIso(),
  });
  return journey;
}

export function deleteJourney(journeyId: string): boolean {
  const s = store();
  const before = s.journeys.length;
  s.journeys = s.journeys.filter((j) => j.id !== journeyId);
  s.enrollments = s.enrollments.filter((e) => e.journeyId !== journeyId);
  return s.journeys.length < before;
}

export function setJourneyStatus(journeyId: string, status: JourneyStatus): Journey | undefined {
  const journey = getJourney(journeyId);
  if (!journey) return undefined;
  journey.status = status;
  journey.updatedAt = nowIso();
  return journey;
}

export function listEnrollments(journeyId: string): JourneyEnrollment[] {
  return store().enrollments.filter((e) => e.journeyId === journeyId);
}

export function enroll(journeyId: string, input: Record<string, unknown>): JourneyEnrollment | undefined {
  const journey = getJourney(journeyId);
  if (!journey) return undefined;
  const ts = nowIso();
  const enrollment: JourneyEnrollment = {
    id: id('enr'),
    journeyId,
    entityType: (input.entityType as JourneyEntityType) ?? journey.entityType,
    entityId: String(input.entityId ?? ''),
    status: 'ACTIVE',
    currentStepId: journey.steps[0]?.id ?? null,
    context: (input.context as Record<string, unknown>) ?? undefined,
    enrolledAt: ts,
  };
  store().enrollments.push(enrollment);
  return enrollment;
}

export function exitEnrollment(journeyId: string, input: Record<string, unknown>): { exited: number } {
  const entityId = input.entityId ? String(input.entityId) : undefined;
  const enrollmentId = input.enrollmentId ? String(input.enrollmentId) : undefined;
  let exited = 0;
  for (const e of store().enrollments) {
    if (e.journeyId !== journeyId || e.status !== 'ACTIVE') continue;
    if ((entityId && e.entityId === entityId) || (enrollmentId && e.id === enrollmentId) || (!entityId && !enrollmentId)) {
      e.status = 'EXITED';
      e.exitedAt = nowIso();
      exited += 1;
    }
  }
  return { exited };
}
