import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createReportsService } from '../services/reports.service.js';

/**
 * PDF Export route for reports.
 * Generates a simple HTML page from report data and returns it as a printable HTML response.
 * The browser can then print-to-PDF or a downstream service can convert this to PDF.
 */
export async function registerExportRoutes(
  app: FastifyInstance,
  reports: ReturnType<typeof createReportsService>
): Promise<void> {
  app.get(
    '/api/v1/reports/:id/export/pdf',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
      const reportId = (request.params as { id: string }).id;
      const result = await reports.runReport(tenantId, reportId, {});
      if (!result) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }

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
  <h1>Report Export</h1>
  <div class="meta">Generated on ${new Date().toLocaleString()} · ${rows.length} rows</div>
  <table>
    <thead>
      <tr>${columns.map((c) => `<th>${String(c).replace(/_/g, ' ')}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map((row: unknown) => `<tr>${columns.map((c) => `<td>${String((row as Record<string, unknown>)[c] ?? '—')}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

      reply.header('Content-Type', 'text/html');
      reply.header('Content-Disposition', `attachment; filename="report-${reportId}.html"`);
      return reply.send(html);
    }
  );
}
