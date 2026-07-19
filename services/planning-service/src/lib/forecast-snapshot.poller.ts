import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { PlanningPrisma } from '../prisma.js';
import { createForecastRollupService } from '../services/forecast-rollup.service.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Daily forecast-snapshot poller.
 *
 * Periodically captures a point-in-time {@link ForecastSnapshot} for every owner
 * aggregate + each team (per-period), so the forecast TREND over a quarter can
 * be reconstructed. Runs cross-tenant with NO tenant ALS (explicit tenantId
 * scoping governs isolation), and is idempotent per UTC day (unique constraint),
 * so multiple ticks in the same day simply re-write the same rows.
 *
 * Fully fail-open: a snapshot error only warns; it never crashes the service.
 */
export function startForecastSnapshotPoller(
  prisma: PlanningPrisma,
  log: LoggerLike
): { stop: () => void } {
  const rollup = createForecastRollupService(prisma);
  const intervalMs = Number(process.env.FORECAST_SNAPSHOT_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
  // Small startup delay so a snapshot lands shortly after boot without blocking it.
  const startupDelayMs = Number(process.env.FORECAST_SNAPSHOT_STARTUP_MS ?? 30_000);

  const tick = async (): Promise<void> => {
    try {
      const res = await rollup.snapshotAll(new Date());
      log.info(
        `planning-service forecast snapshot captured (${res.owners} owner + ${res.teams} team rows)`
      );
    } catch (err) {
      log.warn('planning-service forecast snapshot tick failed (suppressed)', err);
    }
  };

  const startupTimer = setTimeout(() => {
    void runCrossTenant('daily forecast snapshot sweeps owners across all tenants', tick);
  }, startupDelayMs);
  const interval = setInterval(() => {
    void runCrossTenant('daily forecast snapshot sweeps owners across all tenants', tick);
  }, Math.max(60_000, intervalMs));
  // Do not keep the event loop alive solely for the poller.
  if (typeof interval.unref === 'function') interval.unref();
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  return {
    stop: () => {
      clearTimeout(startupTimer);
      clearInterval(interval);
    },
  };
}
