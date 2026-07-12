import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type { EmailTemplate, SmsTemplate } from '../../../../node_modules/.prisma/comm-client/index.js';
import type { CommPrisma } from '../prisma.js';

// Tokens allow dotted paths (`{{deal.name}}`, `{{user.email}}`) as well as the
// legacy single-word form (`{{firstName}}`). `[\w.]+` matches both, so existing
// email templates keep rendering unchanged while the Template Designer's
// merge-field catalog (dotted tokens) is supported too.
const VAR_RE = /\{\{([\w.]+)\}\}/g;

export function extractVariableNames(...sources: string[]): string[] {
  const names = new Set<string>();
  for (const src of sources) {
    let m: RegExpExecArray | null;
    const re = new RegExp(VAR_RE.source, 'g');
    while ((m = re.exec(src)) !== null) {
      names.add(m[1]);
    }
  }
  return [...names];
}

/**
 * Single-pass token substitution shared by every renderer in this service.
 *
 * It is deliberately NOT recursive: replacement values are substituted once and
 * never re-scanned, so a value that itself contains `{{...}}` cannot trigger
 * further expansion (no template-injection amplification, no unbounded
 * recursion). Reuse this — do not hand-roll a second substitution loop.
 */
function applyTokens(
  source: string,
  variables: Record<string, string>,
  fill: string | undefined
): string {
  return source.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    const v = variables[key];
    if (v !== undefined) return v;
    return fill ?? '';
  });
}

/**
 * The `type` discriminator for a designer-managed template row. Stored in
 * `EmailTemplate.type` (default `EMAIL`).
 */
export const TEMPLATE_TYPES = ['EMAIL', 'SMS', 'DOCUMENT'] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export function createTemplatesService(prisma: CommPrisma) {
  async function loadEmailOrThrow(tenantId: string, id: string): Promise<EmailTemplate> {
    const row = await prisma.emailTemplate.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('EmailTemplate', id);
    return row;
  }

  async function loadSmsOrThrow(tenantId: string, id: string): Promise<SmsTemplate> {
    const row = await prisma.smsTemplate.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('SmsTemplate', id);
    return row;
  }

  return {
    async createEmailTemplate(
      tenantId: string,
      data: {
        name: string;
        subject: string;
        htmlBody: string;
        textBody: string;
        category?: string;
      }
    ): Promise<EmailTemplate> {
      const variables = extractVariableNames(data.htmlBody, data.textBody, data.subject);
      return prisma.emailTemplate.create({
        data: {
          tenantId,
          name: data.name,
          subject: data.subject,
          htmlBody: data.htmlBody,
          textBody: data.textBody,
          variables,
          category: data.category ?? 'GENERAL',
        },
      });
    },

    async updateEmailTemplate(
      tenantId: string,
      id: string,
      data: Partial<{
        name: string;
        subject: string;
        htmlBody: string;
        textBody: string;
        category: string;
        isActive: boolean;
      }>
    ): Promise<EmailTemplate> {
      const cur = await loadEmailOrThrow(tenantId, id);
      const subject = data.subject ?? cur.subject;
      const htmlBody = data.htmlBody ?? cur.htmlBody;
      const textBody = data.textBody ?? cur.textBody;
      const variables = extractVariableNames(htmlBody, textBody, subject);
      return prisma.emailTemplate.update({
        where: { id },
        data: {
          ...data,
          variables,
        },
      });
    },

    async deleteEmailTemplate(tenantId: string, id: string): Promise<void> {
      await loadEmailOrThrow(tenantId, id);
      await prisma.emailTemplate.delete({ where: { id } });
    },

    async listEmailTemplates(
      tenantId: string,
      filters: { category?: string; isActive?: boolean }
    ): Promise<EmailTemplate[]> {
      return prisma.emailTemplate.findMany({
        where: {
          tenantId,
          ...(filters.category ? { category: filters.category } : {}),
          ...(typeof filters.isActive === 'boolean' ? { isActive: filters.isActive } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async getEmailTemplateById(tenantId: string, id: string): Promise<EmailTemplate> {
      return loadEmailOrThrow(tenantId, id);
    },

    renderTemplate(
      template: EmailTemplate,
      variables: Record<string, string>,
      options?: { fillMissingWith?: string }
    ): { subject: string; htmlBody: string; textBody: string } {
      const fill = options?.fillMissingWith;
      const missing = template.variables.filter((v) => variables[v] === undefined && fill === undefined);
      if (missing.length) {
        throw new BusinessRuleError(`Missing template variables: ${missing.join(', ')}`);
      }
      return {
        subject: applyTokens(template.subject, variables, fill),
        htmlBody: applyTokens(template.htmlBody, variables, fill),
        textBody: applyTokens(template.textBody, variables, fill),
      };
    },

    /**
     * Render an arbitrary (unsaved) subject/body pair through the shared engine.
     * Powers the Template Designer's live preview: content need not be persisted
     * first. Missing tokens are always filled (never throws on missing vars) so a
     * half-written template still previews cleanly. Uses {@link applyTokens} —
     * the same single-pass, non-recursive substitution as `renderTemplate`.
     */
    renderContent(
      content: { subject?: string; body: string },
      variables: Record<string, string>,
      options?: { fillMissingWith?: string }
    ): { subject: string; html: string } {
      const fill = options?.fillMissingWith ?? '';
      return {
        subject: applyTokens(content.subject ?? '', variables, fill),
        html: applyTokens(content.body, variables, fill),
      };
    },

    async createSmsTemplate(
      tenantId: string,
      data: { name: string; body: string }
    ): Promise<SmsTemplate> {
      if (data.body.length > 160) {
        throw new BusinessRuleError('SMS body must be at most 160 characters');
      }
      const variables = extractVariableNames(data.body);
      return prisma.smsTemplate.create({
        data: { tenantId, name: data.name, body: data.body, variables },
      });
    },

    async updateSmsTemplate(
      tenantId: string,
      id: string,
      data: Partial<{ name: string; body: string; isActive: boolean }>
    ): Promise<SmsTemplate> {
      await loadSmsOrThrow(tenantId, id);
      if (data.body !== undefined && data.body.length > 160) {
        throw new BusinessRuleError('SMS body must be at most 160 characters');
      }
      const variables =
        data.body !== undefined ? extractVariableNames(data.body) : undefined;
      return prisma.smsTemplate.update({
        where: { id },
        data: { ...data, ...(variables ? { variables } : {}) },
      });
    },

    async deleteSmsTemplate(tenantId: string, id: string): Promise<void> {
      await loadSmsOrThrow(tenantId, id);
      await prisma.smsTemplate.delete({ where: { id } });
    },

    async listSmsTemplates(
      tenantId: string,
      filters: { isActive?: boolean }
    ): Promise<SmsTemplate[]> {
      return prisma.smsTemplate.findMany({
        where: {
          tenantId,
          ...(typeof filters.isActive === 'boolean' ? { isActive: filters.isActive } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async getSmsTemplateById(tenantId: string, id: string): Promise<SmsTemplate> {
      return loadSmsOrThrow(tenantId, id);
    },

    renderSmsTemplate(template: SmsTemplate, variables: Record<string, string>): string {
      const missing = template.variables.filter((v) => variables[v] === undefined);
      if (missing.length) {
        throw new BusinessRuleError(`Missing template variables: ${missing.join(', ')}`);
      }
      return applyTokens(template.body, variables, undefined);
    },

    // ── Unified Template Designer CRUD (EMAIL | SMS | DOCUMENT) ───────────────
    // These operate on the EmailTemplate model as the general template store,
    // discriminated by `type`. Legacy /templates/email and /templates/sms
    // endpoints remain for backward compat; the designer uses these.

    async createTemplate(
      tenantId: string,
      data: {
        name: string;
        type?: TemplateType;
        module?: string | null;
        subject?: string;
        body: string;
        textBody?: string;
        category?: string;
        isActive?: boolean;
      }
    ): Promise<EmailTemplate> {
      const subject = data.subject ?? '';
      const htmlBody = data.body;
      const textBody = data.textBody ?? '';
      const variables = extractVariableNames(subject, htmlBody, textBody);
      return prisma.emailTemplate.create({
        data: {
          tenantId,
          name: data.name,
          type: data.type ?? 'EMAIL',
          module: data.module ?? null,
          subject,
          htmlBody,
          textBody,
          variables,
          category: data.category ?? 'GENERAL',
          ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}),
        },
      });
    },

    async updateTemplate(
      tenantId: string,
      id: string,
      data: Partial<{
        name: string;
        type: TemplateType;
        module: string | null;
        subject: string;
        body: string;
        textBody: string;
        category: string;
        isActive: boolean;
      }>
    ): Promise<EmailTemplate> {
      const cur = await loadEmailOrThrow(tenantId, id);
      const subject = data.subject ?? cur.subject;
      const htmlBody = data.body ?? cur.htmlBody;
      const textBody = data.textBody ?? cur.textBody;
      const variables = extractVariableNames(subject, htmlBody, textBody);
      const { body: _body, ...rest } = data;
      return prisma.emailTemplate.update({
        where: { id },
        data: {
          ...rest,
          ...(data.body !== undefined ? { htmlBody } : {}),
          variables,
        },
      });
    },

    async deleteTemplate(tenantId: string, id: string): Promise<void> {
      await loadEmailOrThrow(tenantId, id);
      await prisma.emailTemplate.delete({ where: { id } });
    },

    async getTemplateById(tenantId: string, id: string): Promise<EmailTemplate> {
      return loadEmailOrThrow(tenantId, id);
    },

    async listTemplates(
      tenantId: string,
      filters: { type?: TemplateType; module?: string; category?: string; isActive?: boolean }
    ): Promise<EmailTemplate[]> {
      return prisma.emailTemplate.findMany({
        where: {
          tenantId,
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.module ? { module: filters.module } : {}),
          ...(filters.category ? { category: filters.category } : {}),
          ...(typeof filters.isActive === 'boolean' ? { isActive: filters.isActive } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
    },
  };
}
