#!/usr/bin/env tsx
/**
 * Migrate data from thin CRM services into the unified crm-service database.
 *
 * Usage:
 *   tsx scripts/migrate-crm-data.ts [--dry-run]
 *
 * Prerequisites:
 *   - All Prisma clients must be generated (pnpm db:generate)
 *   - Environment variables for thin-service DBs must be set:
 *     ACCOUNTS_DATABASE_URL, CONTACTS_DATABASE_URL, DEALS_DATABASE_URL,
 *     ACTIVITIES_DATABASE_URL, LEADS_DATABASE_URL, NOTES_DATABASE_URL
 *   - CRM_DATABASE_URL must point to the unified crm-service DB
 */

import { PrismaClient as AccountsPrisma } from '../node_modules/.prisma/accounts-client/index.js';
import { PrismaClient as ContactsPrisma } from '../node_modules/.prisma/contacts-client/index.js';
import { PrismaClient as DealsPrisma } from '../node_modules/.prisma/deals-client/index.js';
import { PrismaClient as ActivitiesPrisma } from '../node_modules/.prisma/activities-client/index.js';
import { PrismaClient as LeadsPrisma } from '../node_modules/.prisma/leads-client/index.js';
import { PrismaClient as NotesPrisma } from '../node_modules/.prisma/notes-client/index.js';
import { PrismaClient as CrmPrisma } from '../node_modules/.prisma/crm-client/index.js';

const dryRun = process.argv.includes('--dry-run');

/* ─── Prisma clients ─────────────────────────────────────────────────────── */

const accountsDb = new AccountsPrisma({
  datasources: { db: { url: process.env.ACCOUNTS_DATABASE_URL } },
});
const contactsDb = new ContactsPrisma({
  datasources: { db: { url: process.env.CONTACTS_DATABASE_URL } },
});
const dealsDb = new DealsPrisma({
  datasources: { db: { url: process.env.DEALS_DATABASE_URL } },
});
const activitiesDb = new ActivitiesPrisma({
  datasources: { db: { url: process.env.ACTIVITIES_DATABASE_URL } },
});
const leadsDb = new LeadsPrisma({
  datasources: { db: { url: process.env.LEADS_DATABASE_URL } },
});
const notesDb = new NotesPrisma({
  datasources: { db: { url: process.env.NOTES_DATABASE_URL } },
});
const crmDb = new CrmPrisma({
  datasources: { db: { url: process.env.CRM_DATABASE_URL } },
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getModelFields(prisma: any, modelName: string): string[] {
  const dmmf = prisma._dmmf as { modelMap: Record<string, { fields: { name: string; kind: string }[] }> };
  const model = dmmf.modelMap[modelName];
  if (!model) throw new Error(`Model ${modelName} not found in target DMMF`);
  return model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name);
}

function mapRecord(record: any, allowedFields: string[]): any {
  const mapped: any = {};
  for (const field of allowedFields) {
    if (field in record) {
      mapped[field] = record[field];
    }
  }
  return mapped;
}

interface MigrateResult {
  inserted: number;
  skipped: number;
  errors: number;
}

async function migrateModel<T extends { id: string }>({
  name,
  source,
  target,
  sourceModel,
  targetModel,
  batchSize = 100,
}: {
  name: string;
  source: any;
  target: any;
  sourceModel: string;
  targetModel: string;
  batchSize?: number;
}): Promise<MigrateResult> {
  console.log(`\n📦 Migrating ${name}...`);

  const sourceRecords: T[] = await source[sourceModel].findMany();
  if (sourceRecords.length === 0) {
    console.log(`✅ ${name}: 0 inserted, 0 skipped, 0 errors (source empty)`);
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  const targetIds = new Set<string>(
    (await target[targetModel].findMany({ select: { id: true } })).map((r: any) => r.id)
  );

  const allowedFields = getModelFields(target, targetModel);
  const toInsert: any[] = [];
  let skipped = 0;

  for (const record of sourceRecords) {
    if (targetIds.has(record.id)) {
      console.warn(`  ⚠️  Skipping ${name} ${record.id}: already exists`);
      skipped++;
      continue;
    }
    toInsert.push(mapRecord(record, allowedFields));
  }

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    if (dryRun) {
      inserted += batch.length;
    } else {
      try {
        await target[targetModel].createMany({ data: batch });
        inserted += batch.length;
      } catch (err) {
        console.error(`  ❌ Failed to insert batch of ${name}:`, (err as Error).message);
        errors += batch.length;
      }
    }
  }

  console.log(`✅ ${name}: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
  return { inserted, skipped, errors };
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  console.log('=== Nexus CRM Data Migration ===');
  console.log(dryRun ? '🔍 DRY RUN — no writes will be performed' : '💾 LIVE RUN');

  const totals: Record<string, MigrateResult> = {};

  try {
    /* 1. Accounts (no FK deps) */
    totals['Account'] = await migrateModel({
      name: 'Account',
      source: accountsDb,
      target: crmDb,
      sourceModel: 'account',
      targetModel: 'account',
    });

    totals['AccountHealthScore'] = await migrateModel({
      name: 'AccountHealthScore',
      source: accountsDb,
      target: crmDb,
      sourceModel: 'accountHealthScore',
      targetModel: 'accountHealthScore',
    });

    /* 2. Contacts (FK to Account — already migrated) */
    totals['Contact'] = await migrateModel({
      name: 'Contact',
      source: contactsDb,
      target: crmDb,
      sourceModel: 'contact',
      targetModel: 'contact',
    });

    totals['ConsentRecord'] = await migrateModel({
      name: 'ConsentRecord',
      source: contactsDb,
      target: crmDb,
      sourceModel: 'consentRecord',
      targetModel: 'consentRecord',
    });

    /* 3. Leads (no FK deps) */
    totals['Lead'] = await migrateModel({
      name: 'Lead',
      source: leadsDb,
      target: crmDb,
      sourceModel: 'lead',
      targetModel: 'lead',
    });

    totals['LeadScore'] = await migrateModel({
      name: 'LeadScore',
      source: leadsDb,
      target: crmDb,
      sourceModel: 'leadScore',
      targetModel: 'leadScore',
    });

    totals['LeadScoringRule'] = await migrateModel({
      name: 'LeadScoringRule',
      source: leadsDb,
      target: crmDb,
      sourceModel: 'leadScoringRule',
      targetModel: 'leadScoringRule',
    });

    totals['LeadRoutingEvent'] = await migrateModel({
      name: 'LeadRoutingEvent',
      source: leadsDb,
      target: crmDb,
      sourceModel: 'leadRoutingEvent',
      targetModel: 'leadRoutingEvent',
    });

    /* 4. Pipelines & Stages */
    totals['Pipeline'] = await migrateModel({
      name: 'Pipeline',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'pipeline',
      targetModel: 'pipeline',
    });

    totals['Stage'] = await migrateModel({
      name: 'Stage',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'stage',
      targetModel: 'stage',
    });

    /* 5. Deals (FK to Account, Pipeline, Stage) */
    totals['Deal'] = await migrateModel({
      name: 'Deal',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'deal',
      targetModel: 'deal',
    });

    totals['DealContact'] = await migrateModel({
      name: 'DealContact',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'dealContact',
      targetModel: 'dealContact',
    });

    totals['DealStakeholder'] = await migrateModel({
      name: 'DealStakeholder',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'dealStakeholder',
      targetModel: 'dealStakeholder',
    });

    totals['DealRoom'] = await migrateModel({
      name: 'DealRoom',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'dealRoom',
      targetModel: 'dealRoom',
    });

    totals['MutualActionItem'] = await migrateModel({
      name: 'MutualActionItem',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'mutualActionItem',
      targetModel: 'mutualActionItem',
    });

    totals['DealRoomDocument'] = await migrateModel({
      name: 'DealRoomDocument',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'dealRoomDocument',
      targetModel: 'dealRoomDocument',
    });

    totals['WinLossReason'] = await migrateModel({
      name: 'WinLossReason',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'winLossReason',
      targetModel: 'winLossReason',
    });

    totals['Quote'] = await migrateModel({
      name: 'Quote',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'quote',
      targetModel: 'quote',
    });

    totals['Competitor'] = await migrateModel({
      name: 'Competitor',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'competitor',
      targetModel: 'competitor',
    });

    totals['DealCompetitor'] = await migrateModel({
      name: 'DealCompetitor',
      source: dealsDb,
      target: crmDb,
      sourceModel: 'dealCompetitor',
      targetModel: 'dealCompetitor',
    });

    /* 6. Activities */
    totals['Activity'] = await migrateModel({
      name: 'Activity',
      source: activitiesDb,
      target: crmDb,
      sourceModel: 'activity',
      targetModel: 'activity',
    });

    totals['EmailThread'] = await migrateModel({
      name: 'EmailThread',
      source: activitiesDb,
      target: crmDb,
      sourceModel: 'emailThread',
      targetModel: 'emailThread',
    });

    totals['EmailMessage'] = await migrateModel({
      name: 'EmailMessage',
      source: activitiesDb,
      target: crmDb,
      sourceModel: 'emailMessage',
      targetModel: 'emailMessage',
    });

    totals['Attachment'] = await migrateModel({
      name: 'Attachment',
      source: activitiesDb,
      target: crmDb,
      sourceModel: 'attachment',
      targetModel: 'attachment',
    });

    /* 7. Notes */
    totals['Note'] = await migrateModel({
      name: 'Note',
      source: notesDb,
      target: crmDb,
      sourceModel: 'note',
      targetModel: 'note',
    });

    /* ─── Summary ───────────────────────────────────────────────────────── */
    console.log('\n=== Migration Summary ===');
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const [name, result] of Object.entries(totals)) {
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      console.log(
        `${name.padEnd(24)} inserted: ${String(result.inserted).padStart(4)}  skipped: ${String(result.skipped).padStart(4)}  errors: ${String(result.errors).padStart(4)}`
      );
    }

    console.log('\n─────────────────────────');
    console.log(`Total inserted: ${totalInserted}`);
    console.log(`Total skipped:  ${totalSkipped}`);
    console.log(`Total errors:   ${totalErrors}`);
    console.log(dryRun ? '\n🔍 Dry run complete. No data was written.' : '\n✅ Migration complete.');

    if (totalErrors > 0) {
      process.exit(1);
    }
  } finally {
    await Promise.all([
      accountsDb.$disconnect(),
      contactsDb.$disconnect(),
      dealsDb.$disconnect(),
      activitiesDb.$disconnect(),
      leadsDb.$disconnect(),
      notesDb.$disconnect(),
      crmDb.$disconnect(),
    ]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
