import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createReportsService } from '../services/reports.service.js';
import type { ReportingPrisma } from '../prisma.js';
import { createReportAuditLogger } from '../lib/audit-logger.js';

/**
 * Printable-HTML export route for reports (browser "print to PDF" or a downstream
 * html→pdf converter). It returns `text/html`, NOT a binary PDF — the route path
 * keeps the `/export/pdf` name for backwards compatibility, but the content-type
 * and `.html` filename are honest about what is actually produced.
 */

/** HTML-escape a value before interpolating it into markup (stored-XSS guard). */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function registerExportRoutes(
  app: FastifyInstance,
  reports: ReturnType<typeof createReportsService>,
  prisma: ReportingPrisma
): Promise<void> {
  const audit = createReportAuditLogger(prisma);
  app.get(
    '/api/v1/reports/:id/export/pdf',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const jwt = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const tenantId = jwt.tenantId;
      const reportId = (request.params as { id: string }).id;
      const result = await reports.runReport(tenantId, reportId, {});
      if (!result) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const report = await reports.getReport(tenantId, reportId);

      const rows = Array.isArray(result.rows) ? result.rows : [];
      const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Report Export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #ddd; }
    td { padding: 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report?.name ?? 'Report Export')}</h1>
  <div class="meta">Generated on ${escapeHtml(new Date().toLocaleString())} · ${rows.length} rows</div>
  <table>
    <thead>
      <tr>${columns.map((c) => `<th>${escapeHtml(String(c).replace(/_/g, ' '))}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map((row: unknown) => `<tr>${columns.map((c) => `<td>${escapeHtml((row as Record<string, unknown>)[c] ?? '—')}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

      audit
        .log({
          tenantId,
          userId: jwt.sub,
          action: 'report_exported',
          reportId,
          reportName: report?.name ?? reportId,
          format: 'pdf',
        })
        .catch((err) => app.log.warn({ err }, 'audit log failed'));

      reply.header('Content-Type', 'text/html');
      reply.header('Content-Disposition', `attachment; filename="report-${reportId}.html"`);
      return reply.send(html);
    }
  );
}
