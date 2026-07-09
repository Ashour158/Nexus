/**
 * Lightweight client for blueprint-service internal validation API.
 */

import { createHttpClient, BusinessRuleError } from '@nexus/service-utils';

const BASE_URL = process.env.BLUEPRINT_SERVICE_URL ?? 'http://localhost:3013';
const TOKEN = process.env.BLUEPRINT_SERVICE_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN ?? '';

const client = createHttpClient({
  baseURL: BASE_URL,
  headers: { 'x-blueprint-service-token': TOKEN },
  maxRetries: 2,
  timeoutMs: 5_000,
});

export interface DealSnapshot {
  [key: string]: unknown;
  contactId?: string;
  linkedContacts?: Array<{ id: string }>;
  completedActivityTypes?: string[];
  activities?: Array<{ type: string; completed: boolean }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export async function validateStageTransition(
  tenantId: string,
  pipelineId: string,
  fromStageId: string,
  toStageId: string,
  dealSnapshot: DealSnapshot
): Promise<ValidationResult> {
  try {
    const res = await client.post<{ success: boolean; data: ValidationResult }>(
      '/api/v1/blueprints/internal/validate-transition',
      { pipelineId, fromStageId, toStageId, dealSnapshot },
      { 'x-tenant-id': tenantId }
    );
    return res.data;
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code ?? '';
    const status = typeof err?.status === 'number' ? err.status : (err?.statusCode ?? 0);
    const isUnavailable =
      status >= 500 ||
      code === 'TIMEOUT' ||
      code === 'CIRCUIT_OPEN' ||
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'NETWORK_ERROR' ||
      err instanceof TypeError;
    if (isUnavailable) {
      throw new BusinessRuleError(
        'Stage transition validation is unavailable; transition blocked until blueprint validation is healthy',
        { service: 'blueprint-service', cause: err?.message }
      );
    }
    throw err;
  }
}

/**
 * Throws BusinessRuleError when validation fails.
 */
export async function assertValidStageTransition(
  tenantId: string,
  pipelineId: string,
  fromStageId: string,
  toStageId: string,
  dealSnapshot: DealSnapshot
): Promise<void> {
  const result = await validateStageTransition(tenantId, pipelineId, fromStageId, toStageId, dealSnapshot);
  if (!result.valid) {
    throw new BusinessRuleError(
      `Stage transition blocked: ${result.errors.join('; ')}`
    );
  }
}
