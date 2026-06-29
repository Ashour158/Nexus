import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError, createHttpClient } from '@nexus/service-utils';
import { z } from 'zod';
import type { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

const IdParam = z.object({ id: z.string().cuid() });

const CreateRuleBody = z.object({
  objectType: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  condition: z.record(z.unknown()),
  requirement: z.record(z.unknown()),
  errorMessage: z.string().min(1).max(1000),
});

const metadataProxyClient = createHttpClient({
  baseURL: process.env.METADATA_SERVICE_URL ?? 'http://localhost:3004',
});

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

function evalPredicate(cond: unknown, payload: Record<string, unknown>): boolean {
  if (!cond || typeof cond !== 'object') return true;
  const c = cond as Record<string, unknown>;

  if (Array.isArray(c.and)) {
    return c.and.every((x) => evalPredicate(x, payload));
  }
  if (Array.isArray(c.or)) {
    return c.or.some((x) => evalPredicate(x, payload));
  }
  if (typeof c.not === 'object' && c.not !== null) {
    return !evalPredicate(c.not, payload);
  }

  const field = typeof c.field === 'string' ? c.field : undefined;
  const op = typeof c.op === 'string' ? c.op : undefined;
  const value = c.value;
  if (!field || !op) return true;

  const actual = getPath(payload, field);
  switch (op) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return Number(actual) > Number(value);
    case 'gte':
      return Number(actual) >= Number(value);
    case 'lt':
      return Number(actual) < Number(value);
    case 'lte':
      return Number(actual) <= Number(value);
    case 'in':
      return Array.isArray(value) ? value.includes(actual) : false;
    case 'contains':
      return typeof actual === 'string' && typeof value === 'string'
        ? actual.toLowerCase().includes(value.toLowerCase())
        : false;
    case 'exists':
      return value ? actual !== undefined && actual !== null : actual == null;
    default:
      return true;
  }
}

function requirementSatisfied(req: unknown, payload: Record<string, unknown>): boolean {
  if (!req || typeof req !== 'object') return true;
  const r = req as Record<string, unknown>;
  if (Array.isArray(r.requiredFields)) {
    return r.requiredFields.every((f) => {
      if (typeof f !== 'string') return true;
      const v = getPath(payload, f);
      return !(v === undefined || v === null || v === '');
    });
  }
  if (typeof r.field === 'string') {
    const v = getPath(payload, r.field);
    return !(v === undefined || v === null || v === '');
  }
  return true;
}

export async function registerValidationRulesRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/validation-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const queryString = new URLSearchParams(request.query as Record<string, string>).toString();
          const path = '/api/v1/validation-rules' + (queryString ? '?' + queryString : '');
          const authHeader = request.headers.authorization as string | undefined;
          const result = await metadataProxyClient.get(path, authHeader ? { Authorization: authHeader } : undefined);
          return reply.send(result);
        }
      );

      r.post(
        '/validation-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;
          const rule = await prisma.validationRule.create({
            data: {
              tenantId: jwt.tenantId,
              objectType: body.objectType,
              name: body.name,
              condition: body.condition as Prisma.InputJsonValue,
              requirement: body.requirement as Prisma.InputJsonValue,
              errorMessage: body.errorMessage,
            },
          });
          return reply.code(201).send({ success: true, data: rule });
        }
      );

      r.post(
        '/validation-rules/validate',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const body = request.body as { objectType?: string; payload?: Record<string, unknown> };
          if (!body.objectType?.trim()) {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectType required', requestId: request.id } });
          }
          const payload = (body.payload ?? {}) as Record<string, unknown>;
          const rules = await prisma.validationRule.findMany({
            where: { tenantId: jwt.tenantId, objectType: body.objectType, isActive: true },
            orderBy: { createdAt: 'asc' },
          });
          const violations = rules
            .filter((rule) => evalPredicate(rule.condition, payload) && !requirementSatisfied(rule.requirement, payload))
            .map((rule) => ({
              ruleId: rule.id,
              ruleName: rule.name,
              errorMessage: rule.errorMessage,
            }));
          return reply.send({
            success: true,
            data: {
              valid: violations.length === 0,
              objectType: body.objectType,
              rulesEvaluated: rules.length,
              violations,
              note: rules.length === 0 ? 'No active rules for this object type.' : undefined,
            },
          });
        }
      );

      r.patch(
        '/validation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const rule = await prisma.validationRule.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!rule) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const body = request.body as { isActive?: boolean; errorMessage?: string; name?: string };
          const updated = await prisma.validationRule.update({
            where: { id },
            data: body,
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/validation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const rule = await prisma.validationRule.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!rule) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.validationRule.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
