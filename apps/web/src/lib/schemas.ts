import { z } from 'zod';

export const contactSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  jobTitle: z.string().max(100).optional(),
});

export const dealSchema = z.object({
  name: z.string().min(1, 'Deal name is required').max(200),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  expectedCloseDate: z.string().min(1, 'Close date is required'),
  stageId: z.string().min(1, 'Stage is required'),
  pipelineId: z.string().min(1, 'Pipeline is required'),
});

export const leadSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  company: z.string().optional(),
  source: z.string().optional(),
});

export const forecastSchema = z.object({
  weekOf: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export type ContactFormData = z.infer<typeof contactSchema>;
export type DealFormData = z.infer<typeof dealSchema>;
export type LeadFormData = z.infer<typeof leadSchema>;
