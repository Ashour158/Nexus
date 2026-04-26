import { z } from 'zod';

export const CreatePlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  stripePriceId: z.string().max(200).optional(),
  intervalType: z.enum(['monthly', 'annual']),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default('USD'),
  maxSeats: z.number().int().positive().optional(),
  features: z.array(z.unknown()).optional(),
});

export const UpdatePlanSchema = CreatePlanSchema.partial();

export const CreateSubscriptionSchema = z.object({
  planId: z.string().min(1),
  stripeCustomerId: z.string().optional(),
  seats: z.number().int().min(1).optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
});

export const UpdateSubscriptionSchema = z.object({
  planId: z.string().optional(),
  seats: z.number().int().min(1).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

export const RecordUsageSchema = z.object({
  metric: z.enum(['api_calls', 'storage_gb', 'emails_sent']),
  quantity: z.number().int().min(0),
});

export const GenerateInvoiceSchema = z.object({
  subscriptionId: z.string().min(1),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>;
export type RecordUsageInput = z.infer<typeof RecordUsageSchema>;
export type GenerateInvoiceInput = z.infer<typeof GenerateInvoiceSchema>;
