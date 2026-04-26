import { z } from 'zod';

export const CreatePlaybookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  pipelineId: z.string().optional(),
});

export const UpdatePlaybookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const UpsertPlaybookStageSchema = z.object({
  stageId: z.string().min(1),
  stageName: z.string().min(1).max(200),
  position: z.number().int().min(0),
  entryActions: z.array(z.unknown()).optional(),
  exitCriteria: z.array(z.unknown()).optional(),
  requiredFields: z.array(z.string()).optional(),
  talkingPoints: z.array(z.string()).optional(),
  resources: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
      })
    )
    .optional(),
});

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  pipelineId: z.string().optional(),
  fields: z.array(z.unknown()).default([]),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

const RuleSchema = z.object({
  type: z.enum(['required_field', 'min_value', 'activity_completed', 'contact_linked']),
  field: z.string().optional(),
  minValue: z.number().optional(),
  activityType: z.string().optional(),
  errorMessage: z.string().min(1),
});

export const UpsertValidationRuleSchema = z.object({
  pipelineId: z.string().min(1),
  fromStageId: z.string().min(1),
  toStageId: z.string().min(1),
  rules: z.array(RuleSchema).min(1),
});

export const ValidateTransitionSchema = z.object({
  pipelineId: z.string().min(1),
  fromStageId: z.string().min(1),
  toStageId: z.string().min(1),
  dealSnapshot: z.record(z.unknown()),
});

export type CreatePlaybookInput = z.infer<typeof CreatePlaybookSchema>;
export type UpdatePlaybookInput = z.infer<typeof UpdatePlaybookSchema>;
export type UpsertPlaybookStageInput = z.infer<typeof UpsertPlaybookStageSchema>;
export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type UpsertValidationRuleInput = z.infer<typeof UpsertValidationRuleSchema>;
export type ValidateTransitionInput = z.infer<typeof ValidateTransitionSchema>;
