/**
 * Deal outcome reconciliation (audit P0).
 *
 * INVARIANT: a deal sitting in a terminal stage (`stage.isWon` / `stage.isLost`)
 * MUST carry the matching canonical outcome — `status` WON/LOST and a non-null
 * `actualCloseDate`. When those drift apart, engines that read different fields
 * disagree about the same record: the funnel (reads stage) reports wins while
 * win/loss (reads status) reports none, performance counts open pipeline as
 * revenue, and commissions never fire because no `deal.won` was ever published.
 *
 * Rows can drift when they are written OUTSIDE the service layer — seed scripts
 * and direct SQL bypass the stage->status reconciliation that
 * `deals.service.ts` now enforces on both write paths.
 *
 * This job finds and repairs that drift. It is SAFE TO RE-RUN: it only touches
 * rows that violate the invariant, and it is a no-op once they are consistent.
 *
 *   node scripts/reconcile-deal-outcomes.mjs            # dry-run (default)
 *   node scripts/reconcile-deal-outcomes.mjs --apply    # perform the repair
 *
 * Requires DATABASE_URL for the CRM database. Run inside the crm-service
 * container so it uses the same connection string as the app.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const terminalStages = await prisma.stage.findMany({
    where: { OR: [{ isWon: true }, { isLost: true }] },
    select: { id: true, name: true, isWon: true, isLost: true, tenantId: true },
  });
  if (terminalStages.length === 0) {
    console.log('No terminal stages defined — nothing to reconcile.');
    return;
  }
  const byId = new Map(terminalStages.map((s) => [s.id, s]));

  // Violations: parked in a terminal stage but not canonically closed.
  const drifted = await prisma.deal.findMany({
    where: {
      stageId: { in: terminalStages.map((s) => s.id) },
      OR: [{ status: { notIn: ['WON', 'LOST'] } }, { actualCloseDate: null }],
    },
    select: {
      id: true, name: true, tenantId: true, stageId: true, status: true,
      actualCloseDate: true, probability: true, forecastCategory: true,
      amount: true, lostReason: true,
    },
  });

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — terminal stages: ${terminalStages.length}, drifted deals: ${drifted.length}\n`);
  if (drifted.length === 0) {
    console.log('Invariant already holds. Nothing to do.');
    return;
  }

  let wonCount = 0;
  let lostCount = 0;

  for (const d of drifted) {
    const stage = byId.get(d.stageId);
    const won = Boolean(stage?.isWon);
    // Close date is unknown for historical drift; use updatedAt-equivalent
    // (now) only when applying, and say so plainly rather than inventing a
    // plausible-looking past date.
    const next = won
      ? { status: 'WON', probability: 100, forecastCategory: 'CLOSED' }
      : { status: 'LOST', probability: 0, forecastCategory: 'OMITTED' };
    won ? wonCount++ : lostCount++;

    console.log(`  ${d.name}`);
    console.log(`     stage      : ${stage?.name} (${won ? 'WON' : 'LOST'})`);
    console.log(`     status     : ${d.status} -> ${next.status}`);
    console.log(`     closeDate  : ${d.actualCloseDate ?? 'null'} -> ${APPLY ? '<now>' : '<now on apply>'}`);
    console.log(`     probability: ${d.probability} -> ${next.probability}`);
    console.log(`     forecastCat: ${d.forecastCategory} -> ${next.forecastCategory}`);
    console.log(`     amount     : ${d.amount}`);

    if (APPLY) {
      const data = {
        ...next,
        actualCloseDate: new Date(),
        version: { increment: 1 },
      };
      if (!won && !d.lostReason) {
        data.lostReason = 'Reconciled from terminal stage';
        data.closeReason = 'Reconciled from terminal stage';
      }
      await prisma.deal.update({ where: { id: d.id }, data });
    }
  }

  console.log(`\n${APPLY ? 'REPAIRED' : 'WOULD REPAIR'}: ${drifted.length} deals (${wonCount} won, ${lostCount} lost)`);
  if (APPLY) {
    console.log(
      '\nNOTE: this repairs STORED STATE only. Downstream read models (analytics\n' +
      'snapshots, win/loss, commissions) are event-driven and were never sent a\n' +
      'deal.won/deal.lost for these rows. Re-project them, or replay outcome\n' +
      'events, so the read side matches. Verify before trusting revenue numbers.'
    );
  } else {
    console.log('\nRe-run with --apply to perform the repair.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
