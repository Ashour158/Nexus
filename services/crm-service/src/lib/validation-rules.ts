import type { CrmPrisma } from '../prisma.js';

export type ValidationCondition = { field: string; operator: string; value?: unknown };
export type ValidationRequirement = {
  field: string;
  rule:
    | 'required'
    | { min?: number; max?: number }
    | { pattern: string };
};

function evaluateCondition(record: Record<string, unknown>, condition: ValidationCondition): boolean {
  const val = record[condition.field];
  switch (condition.operator) {
    case 'eq':
      return val === condition.value;
    case 'neq':
      return val !== condition.value;
    case 'isNotNull':
      return val !== null && val !== undefined && val !== '';
    case 'isNull':
      return val === null || val === undefined || val === '';
    case 'in':
      return Array.isArray(condition.value) && (condition.value as unknown[]).includes(val);
    default:
      return false;
  }
}

function evaluateRequirement(
  record: Record<string, unknown>,
  requirement: ValidationRequirement
): boolean {
  const val = record[requirement.field];
  if (requirement.rule === 'required') {
    return val !== null && val !== undefined && val !== '';
  }
  if (typeof requirement.rule === 'object' && 'min' in requirement.rule) {
    const num = Number(val);
    if (Number.isNaN(num)) return false;
    if (requirement.rule.min !== undefined && num < requirement.rule.min) return false;
    if (requirement.rule.max !== undefined && num > requirement.rule.max) return false;
    return true;
  }
  if (typeof requirement.rule === 'object' && 'pattern' in requirement.rule) {
    return new RegExp(requirement.rule.pattern).test(String(val ?? ''));
  }
  return true;
}

export async function validateRecord(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: string,
  record: Record<string, unknown>
): Promise<{ valid: boolean; errors: string[] }> {
  const rules = await prisma.validationRule.findMany({
    where: { tenantId, objectType, isActive: true },
  });

  const errors: string[] = [];

  for (const rule of rules) {
    const condition = rule.condition as unknown as ValidationCondition;
    const requirement = rule.requirement as unknown as ValidationRequirement;

    if (!evaluateCondition(record, condition)) continue;

    if (!evaluateRequirement(record, requirement)) {
      errors.push(rule.errorMessage);
    }
  }

  return { valid: errors.length === 0, errors };
}
