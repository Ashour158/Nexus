import { z } from 'zod';

export const contactSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  mobile: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  secondPhone: z.string().max(30).optional(),
  jobTitle: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  accountId: z.string().optional(),
  ownerId: z.string().optional(),
  photoUrl: z.string().max(500000, 'Photo file is too large').optional().or(z.literal('')),
  linkedInUrl: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  twitterHandle: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
  timezone: z.string().max(80).optional(),
  preferredChannel: z.string().max(50).optional(),
  lifecycleStage: z.string().max(80).optional(),
  tags: z.array(z.string()).optional(),
  productTags: z.array(z.string()).optional(),
  industryTags: z.array(z.string()).optional(),
  gdprConsent: z.boolean().optional(),
  doNotEmail: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
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
