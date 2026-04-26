import { z } from 'zod';

export const CreateWebhookSubscriptionSchema = z.object({
  name: z.string().min(1).max(200),
  targetUrl: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

export const UpdateWebhookSubscriptionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetUrl: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
});

export const UpsertConnectionSchema = z.object({
  provider: z.enum(['hubspot', 'salesforce', 'google']),
  providerAccountId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const StartSyncJobSchema = z.object({
  connectionId: z.string().min(1),
  jobType: z.enum(['contacts_import', 'deals_import', 'contacts_export']),
});

export type CreateWebhookSubscriptionInput = z.infer<typeof CreateWebhookSubscriptionSchema>;
export type UpdateWebhookSubscriptionInput = z.infer<typeof UpdateWebhookSubscriptionSchema>;
export type UpsertConnectionInput = z.infer<typeof UpsertConnectionSchema>;
export type StartSyncJobInput = z.infer<typeof StartSyncJobSchema>;
