import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type { EmailTemplate, SmsTemplate } from '../../../../node_modules/.prisma/comm-client/index.js';
import type { CommPrisma } from '../prisma.js';

const VAR_RE = /\{\{(\w+)\}\}/g;

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
      const apply = (s: string) =>
        s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          const v = variables[key];
          if (v !== undefined) return v;
          return fill ?? '';
        });
      return {
        subject: apply(template.subject),
        htmlBody: apply(template.htmlBody),
        textBody: apply(template.textBody),
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
      return template.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
    },
  };
}
