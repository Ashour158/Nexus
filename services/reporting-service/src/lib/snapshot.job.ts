import type { ReportingPrisma } from '../prisma.js';

export async function takeSnapshotNow(
  prisma: ReportingPrisma,
  tenantId: string,
  pipelineId?: string
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const crm = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const u = new URL(`${crm}/api/v1/internal/reporting/deals`);
  u.searchParams.set('limit', '2000');
  if (pipelineId && pipelineId !== 'all') u.searchParams.set('pipelineId', pipelineId);

  const response = await fetch(u, {
    headers: {
      'x-service-token': token,
      'x-tenant-id': tenantId,
    },
  });
  if (!response.ok) return;

  const body = (await response.json()) as {
    data?: Array<{ id: string; name: string; stage: string; value: number }>;
  };
  const deals = body.data ?? [];

  const pid = pipelineId ?? 'all';
  const stageMap = new Map<string, { dealCount: number; totalValue: number; deals: typeof deals }>();

  for (const deal of deals) {
    const stage = deal.stage ?? 'Unknown';
    const entry = stageMap.get(stage) ?? { dealCount: 0, totalValue: 0, deals: [] };
    entry.dealCount++;
    entry.totalValue += deal.value ?? 0;
    entry.deals.push(deal);
    stageMap.set(stage, entry);
  }

  const stages = Array.from(stageMap.entries()).map(([name, data]) => ({
    name,
    dealCount: data.dealCount,
    totalValue: data.totalValue,
    deals: data.deals.slice(0, 100),
  }));

  // The schema stores one snapshot row per pipeline stage (composite key
  // tenantId+pipelineId+snapshotDate+stage), so upsert each stage individually.
  for (const s of stages) {
    await prisma.pipelineSnapshot.upsert({
      where: {
        tenantId_pipelineId_snapshotDate_stage: {
          tenantId,
          pipelineId: pid,
          snapshotDate: today,
          stage: s.name,
        },
      },
      create: {
        tenantId,
        pipelineId: pid,
        snapshotDate: today,
        stage: s.name,
        dealCount: s.dealCount,
        totalValue: s.totalValue,
        dealIds: s.deals.map((d) => d.id),
      },
      update: {
        dealCount: s.dealCount,
        totalValue: s.totalValue,
        dealIds: s.deals.map((d) => d.id),
      },
    });
  }
}

export function startSnapshotScheduler(prisma: ReportingPrisma): NodeJS.Timeout {
  const INTERVAL_MS = 60 * 1000;
  return setInterval(async () => {
    const hour = new Date().getHours();
    const minute = new Date().getMinutes();
    if (hour !== 23 || minute < 45) return;

    try {
      const tenants =
        process.env.PIPELINE_SNAPSHOT_TENANT_IDS?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      for (const tenantId of tenants) {
        await takeSnapshotNow(prisma, tenantId).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }, INTERVAL_MS);
}
