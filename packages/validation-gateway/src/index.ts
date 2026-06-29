/**
 * Data Validation Gateway — Zod-based schema validation for all API inputs.
 *
 * Re-exports all schemas from @nexus/validation plus Fastify hook utilities.
 */

import { z, type ZodSchema, type ZodError } from 'zod';

export { z, ZodSchema, ZodError };

/** Re-export canonical schemas so consumers only need one import. */
export {
  PaginationSchema,
  IdParamSchema,
  CreateContactSchema,
  UpdateContactSchema,
  ContactListQuerySchema,
  CreateDealSchema,
  UpdateDealSchema,
  DealListQuerySchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  AccountListQuerySchema,
  CreateLeadSchema,
  UpdateLeadSchema,
  LeadListQuerySchema,
  CreateActivitySchema,
  UpdateActivitySchema,
  ActivityListQuerySchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  NoteListQuerySchema,
  CreatePipelineSchema,
  UpdatePipelineSchema,
  CreateQuoteSchema,
  UpdateQuoteSchema,
  QuoteListQuerySchema,
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  InvoiceListQuerySchema,
  CreateContractSchema,
  UpdateContractSchema,
  ContractListQuerySchema,
  CreateProductSchema,
  UpdateProductSchema,
  ProductListQuerySchema,
  CreateCompanySchema,
  UpdateCompanySchema,
  CompanyListQuerySchema,
  CreateTagSchema,
  UpdateTagSchema,
  CreateCustomFieldSchema,
  UpdateCustomFieldSchema,
  InviteUserSchema,
  UpdateUserSchema,
  CreateRoleSchema,
  UpdateRoleSchema,
  UserListQuerySchema,
  CreateApiKeySchema,
  PatchTenantSchema,
  MarkDealLostSchema,
  MoveDealStageSchema,
  AddDealContactSchema,
  MeddicicDataSchema,
  ConvertLeadSchema,
  CompleteActivitySchema,
  RescheduleActivitySchema,
  UpcomingActivitiesQuerySchema,
  RecordPaymentSchema,
  RejectQuoteSchema,
  VoidQuoteSchema,
  CpqPriceRequestSchema,
  ClawbackCommissionSchema,
  CommissionListQuerySchema,
  CommissionSummaryQuerySchema,
  SignContractSchema,
} from '@nexus/validation';

/** Validates request body against a Zod schema. Returns parsed data or throws. */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

/** Validates query params against a Zod schema. */
export function validateQuery<T>(schema: ZodSchema<T>, query: unknown): T {
  return schema.parse(query);
}

/** Validates path params against a Zod schema. */
export function validateParams<T>(schema: ZodSchema<T>, params: unknown): T {
  return schema.parse(params);
}

/** Fastify preValidation hook factory. */
export function createValidationHook<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return async (request: Record<string, unknown>, reply: Record<string, unknown>) => {
    try {
      const data = schema.parse(request[source]);
      (request as Record<string, unknown>)[`validated${source.charAt(0).toUpperCase()}${source.slice(1)}`] = data;
    } catch (err) {
      const zodError = err as ZodError;
      (reply as { statusCode: number }).statusCode = 400;
      await (reply as { send: (payload: unknown) => Promise<void> }).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: zodError.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      throw new Error('ValidationError');
    }
  };
}

/** Common validation schemas (legacy aliases — prefer @nexus/validation exports). */
export const schemas = {
  uuid: z.string().uuid(),
  email: z.string().email(),
  tenantId: z.string().min(1).max(64),
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
  contactCreate: z.object({
    email: z.string().email(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    phone: z.string().optional(),
    accountId: z.string().uuid().optional(),
  }),
  dealCreate: z.object({
    name: z.string().min(1).max(200),
    amount: z.number().min(0),
    status: z.enum(['OPEN', 'WON', 'LOST', 'DORMANT']),
    accountId: z.string().cuid().optional(),
    ownerId: z.string().cuid(),
  }),
};
