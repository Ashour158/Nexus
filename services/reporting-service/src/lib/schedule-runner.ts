import type { ReportingPrisma } from '../prisma.js';
import { executeReport, exportToCsv } from './report-engine.js';

export function startScheduleRunner(prisma: ReportingPrisma): NodeJS.Timeout {
  return setInterval(async () => {
    const now = new Date();
    const due = await prisma.reportSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      include: { report: true },
      take: 20,
    });

    const svc = process.env.INTERNAL_SERVICE_TOKEN ?? '';
    const comm = process.env.COMM_SERVICE_URL ?? 'http://localhost:3009';

    for (const schedule of due) {
      try {
        const result = await executeReport(prisma, schedule.tenantId, {
          objectType: schedule.report.objectType as 'deals',
          columns: schedule.report.columns as string[],
          filters: (schedule.report.filters as never) ?? [],
          groupBy: schedule.report.groupBy ?? undefined,
          sortBy: schedule.report.sortBy ?? undefined,
          sortDir: (schedule.report.sortDir ?? 'desc') as 'desc',
          limit: 2000,
          offset: 0,
        }, { serviceToken: svc });

        const csv = await exportToCsv(result.rows, schedule.report.columns as string[]);

        const recipients = schedule.recipients as string[];
        const htmlBody = `
          <p>Your scheduled report <strong>${schedule.report.name}</strong> (${schedule.format}).</p>
          <pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(csv)}</pre>
          <p><small>Generated: ${now.toISOString()}</small></p>`;

        await fetch(`${comm}/api/v1/internal/outbox/email-broadcast`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-service-token': svc,
          },
          body: JSON.stringify({
            tenantId: schedule.tenantId,
            recipients,
            subject: schedule.subject ?? `Scheduled Report: ${schedule.report.name}`,
            htmlBody,
          }),
        });

        const nextRunAt = computeNextRun(schedule.cronExpr, now);
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        });
      } catch (err) {
        console.error(`Schedule ${schedule.id} failed:`, err);
      }
    }
  }, 60 * 1000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeNextRun(cronExpr: string, from: Date): Date {
  const parts = cronExpr.split(/\s+/).filter(Boolean);
  const minute = parts[0] === '*' ? -1 : parseInt(parts[0] ?? '0', 10);
  const hour = parts[1] === '*' ? -1 : parseInt(parts[1] ?? '9', 10);
  const dayOfWeek = parts[4] === '*' ? -1 : parseInt(parts[4] ?? '-1', 10);

  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  if (minute >= 0) next.setMinutes(minute);
  if (hour >= 0) next.setHours(hour);
  if (dayOfWeek >= 0) {
    let attempts = 0;
    next.setDate(next.getDate() + 1);
    while (next.getDay() !== dayOfWeek && attempts < 14) {
      next.setDate(next.getDate() + 1);
      attempts++;
    }
  } else {
    next.setDate(next.getDate() + 1);
  }
  return next;
}
