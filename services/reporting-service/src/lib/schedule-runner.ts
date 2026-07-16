import cronParser from 'cron-parser';
import type { ReportingPrisma } from '../prisma.js';
import { executeReport, exportToCsv, type ReportObjectType } from './report-engine.js';
import { executeReport as executeDefinitionReport, type QuerySpec } from '../services/executor.service.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const BATCH = 20;
/** Scheduled runs are background work, so they tolerate a slower query than a UI read. */
const SCHEDULE_QUERY_TIMEOUT_MS = 15000;

/**
 * Compute the next fire time for a standard 5-field cron expression
 * (minute hour day-of-month month day-of-week), honoring steps (`*​/5`),
 * ranges (`1-5`), lists (`1,15`), day-of-month and month — via `cron-parser`.
 *
 * On an unparseable expression we fail safe to "one day later" so a bad cron can
 * never wedge the runner or produce an immediate hot-loop.
 */
export function computeNextRun(cronExpr: string, from: Date): Date {
  try {
    const it = cronParser.parseExpression(cronExpr, { currentDate: from });
    return it.next().toDate();
  } catch {
    const fallback = new Date(from);
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }
}

/**
 * Whether `computeNextRun` can actually honor this expression.
 *
 * Worth checking at CREATE time: computeNextRun deliberately fails safe to
 * "tomorrow" on a bad cron, which keeps the runner healthy but means a typo
 * turns into a subscription that quietly fires at the wrong time forever.
 */
export function isValidCron(cronExpr: string): boolean {
  try {
    cronParser.parseExpression(cronExpr);
    return true;
  } catch {
    return false;
  }
}

interface InternalQueryResult {
  columns: Array<{ key: string; label: string; type: string }>;
  rows: Record<string, unknown>[];
}

/**
 * Run a saved ReportSpec via analytics' internal service-token route.
 *
 * Deliberately THROWS on any failure, unlike the fail-open `analytics-client`
 * used on the interactive read path: a scheduled email that silently ships zero
 * rows because analytics was down looks exactly like "the business did nothing
 * this week", which is worse than no email at all. The caller records the error
 * and still advances nextRunAt.
 */
async function runSpecInternally(tenantId: string, spec: unknown, svc: string): Promise<InternalQueryResult> {
  // ANALYTICS_SERVICE_URL carries the `/api/v1/analytics` suffix by convention;
  // the internal route lives at `/api/v1/internal/analytics/query`, so derive the
  // service root rather than assuming the base.
  const configured = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008/api/v1/analytics';
  const root = configured.replace(/\/api\/v1\/analytics\/?$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEDULE_QUERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${root}/api/v1/internal/analytics/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-token': svc },
      body: JSON.stringify({ tenantId, spec }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`analytics query failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as { data?: InternalQueryResult };
    if (!body?.data) throw new Error('analytics query returned no data');
    return { columns: body.data.columns ?? [], rows: body.data.rows ?? [] };
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlBody(reportName: string, format: string, csv: string, now: Date, rowCount: number): string {
  return `
          <p>Your scheduled report <strong>${escapeHtml(reportName)}</strong> (${escapeHtml(format)}).</p>
          <pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(csv)}</pre>
          <p><small>Generated: ${now.toISOString()} — ${rowCount} row(s)</small></p>`;
}

/**
 * Deliver a rendered report to its recipients through the SAME comm-service
 * outbox email path both schedule models use. Throws on a non-2xx so the caller
 * records the failure (nextRunAt is still advanced by the caller's `finally`, so
 * a broken report never hot-loops every tick).
 */
async function deliverReportEmail(
  comm: string,
  svc: string,
  tenantId: string,
  recipients: string[],
  subject: string,
  htmlBody: string
): Promise<void> {
  const res = await fetch(`${comm}/api/v1/internal/outbox/email-broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': svc,
    },
    body: JSON.stringify({ tenantId, recipients, subject, htmlBody }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`email-broadcast failed: ${res.status} ${bodyText.slice(0, 500)}`);
  }
}

/** Process due ReportSchedule rows (self-serve builder / SavedReport). */
async function processSavedReportSchedules(
  prisma: ReportingPrisma,
  now: Date,
  comm: string,
  svc: string
): Promise<number> {
  const due = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { report: true },
    take: BATCH,
  });

  for (const schedule of due) {
    try {
      // Run the saved report of ANY dataset (was hard-cast to 'deals'). Datasets
      // the background path can't source degrade to an empty result rather than
      // throwing — see report-engine.executeReportViaServiceToken.
      const columns = schedule.report.columns as string[];
      const result = await executeReport(
        prisma,
        schedule.tenantId,
        {
          objectType: (schedule.report.objectType as ReportObjectType) ?? 'deals',
          columns,
          filters: (schedule.report.filters as never) ?? [],
          groupBy: schedule.report.groupBy ?? undefined,
          sortBy: schedule.report.sortBy ?? undefined,
          sortDir: (schedule.report.sortDir ?? 'desc') as 'desc',
          limit: 2000,
          offset: 0,
        },
        { serviceToken: svc }
      );

      const csv = await exportToCsv(result.rows, columns);
      await deliverReportEmail(
        comm,
        svc,
        schedule.tenantId,
        schedule.recipients as string[],
        schedule.subject ?? `Scheduled Report: ${schedule.report.name}`,
        buildHtmlBody(schedule.report.name, schedule.format, csv, now, result.rows.length)
      );
    } catch (err) {
      console.error(`ReportSchedule ${schedule.id} failed:`, err);
    } finally {
      // ALWAYS advance nextRunAt — even on failure — so a broken report can never
      // re-run every 60s in a hot loop. (This was the audit's dead path.)
      try {
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cron, now) },
        });
      } catch (err) {
        console.error(`ReportSchedule ${schedule.id} nextRunAt advance failed:`, err);
      }
    }
  }
  return due.length;
}

/**
 * Process due DefinitionReportSchedule rows (legacy template-based
 * ReportDefinition). This is the path RR-H20 flagged as never executing: the old
 * `processSchedules()` was never invoked and, even if it had been, only ran the
 * report without delivering. It now renders + delivers through the same outbox
 * email path as the self-serve schedules above.
 */
async function processDefinitionSchedules(
  prisma: ReportingPrisma,
  now: Date,
  comm: string,
  svc: string
): Promise<number> {
  const due = await prisma.definitionReportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { report: true },
    take: BATCH,
  });

  for (const schedule of due) {
    try {
      const spec = (schedule.report.querySpec ?? {}) as QuerySpec;
      const result = await executeDefinitionReport(schedule.tenantId, schedule.report.datasource, spec, {});
      const columns = spec.columns && spec.columns.length > 0 ? spec.columns : result.columns;
      const csv = await exportToCsv(result.rows, columns);
      await deliverReportEmail(
        comm,
        svc,
        schedule.tenantId,
        schedule.recipients as string[],
        `Scheduled Report: ${schedule.report.name}`,
        buildHtmlBody(schedule.report.name, schedule.format, csv, now, result.rows.length)
      );
    } catch (err) {
      console.error(`DefinitionReportSchedule ${schedule.id} failed:`, err);
    } finally {
      try {
        await prisma.definitionReportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cron, now) },
        });
      } catch (err) {
        console.error(`DefinitionReportSchedule ${schedule.id} nextRunAt advance failed:`, err);
      }
    }
  }
  return due.length;
}

/**
 * Process due BiReportSchedule rows — the modern ReportSpec/ClickHouse path.
 *
 * A cron run has no logged-in user, and analytics' public `/query` derives the
 * tenant from the caller's JWT, so this goes through analytics' internal
 * service-token route (`/internal/analytics/query`) with an explicit tenantId.
 *
 * Unlike the two paths above, a failure here is also persisted to `lastError`:
 * an email subscription that silently stops arriving is worse than one that
 * reports why.
 */
async function processBiReportSchedules(
  prisma: ReportingPrisma,
  now: Date,
  comm: string,
  svc: string
): Promise<number> {
  const due = await prisma.biReportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { report: true },
    take: BATCH,
  });

  for (const schedule of due) {
    let failure: string | null = null;
    try {
      const result = await runSpecInternally(schedule.tenantId, schedule.report.spec, svc);
      // Column order comes from the compiler, so the CSV matches the on-screen report.
      const columns = result.columns.map((c) => c.key);
      const csv = await exportToCsv(result.rows, columns);
      await deliverReportEmail(
        comm,
        svc,
        schedule.tenantId,
        schedule.recipients as string[],
        schedule.subject ?? `Scheduled Report: ${schedule.report.name}`,
        buildHtmlBody(schedule.report.name, schedule.format, csv, now, result.rows.length)
      );
    } catch (err) {
      failure = (err as Error)?.message ?? String(err);
      console.error(`BiReportSchedule ${schedule.id} failed:`, err);
    } finally {
      // ALWAYS advance nextRunAt — even on failure — so a broken report can never
      // re-run every 60s in a hot loop.
      try {
        await prisma.biReportSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: computeNextRun(schedule.cron, now),
            lastError: failure ? failure.slice(0, 500) : null,
          },
        });
      } catch (err) {
        console.error(`BiReportSchedule ${schedule.id} nextRunAt advance failed:`, err);
      }
    }
  }
  return due.length;
}

/**
 * Single consolidated pass over ALL THREE schedule models. Exported so it can be
 * driven by the interval runner (index.ts) or triggered directly
 * (reports.service.processSchedules / tests).
 */
export async function runDueSchedules(
  prisma: ReportingPrisma
): Promise<{ savedProcessed: number; definitionProcessed: number; biProcessed: number }> {
  const now = new Date();
  const svc = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const comm = process.env.COMM_SERVICE_URL ?? 'http://localhost:3009';

  const savedProcessed = await processSavedReportSchedules(prisma, now, comm, svc);
  const definitionProcessed = await processDefinitionSchedules(prisma, now, comm, svc);
  const biProcessed = await processBiReportSchedules(prisma, now, comm, svc);
  return { savedProcessed, definitionProcessed, biProcessed };
}

export function startScheduleRunner(prisma: ReportingPrisma): NodeJS.Timeout {
  // Reentrancy guard: a slow tick must not overlap the next interval fire, which
  // would double-run due schedules.
  let running = false;
  return setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runDueSchedules(prisma);
    } catch (err) {
      console.error('Schedule runner tick failed:', err);
    } finally {
      running = false;
    }
  }, CHECK_INTERVAL_MS);
}
