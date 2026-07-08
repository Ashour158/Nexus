import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';

/**
 * BL-04 — atomic, gapless document-number allocation.
 *
 * The old numbering schemes (`count()+1`, `findFirst desc + slice + 1`) read the
 * current max and added one in application code, so two concurrent creates read
 * the same value and minted the same number — the unique constraint then turned
 * the race into a 500.
 *
 * This helper allocates the next number for `(tenantId, entity, period)` with a
 * single `INSERT … ON CONFLICT DO UPDATE SET nextSequence = nextSequence + 1
 * RETURNING` statement. Postgres evaluates the increment under a row lock, so the
 * value is unique per caller with no read-then-write window. Run it INSIDE the
 * same transaction as the record insert (pass the transaction client) so a
 * failed insert rolls the increment back and never burns/gaps a number.
 *
 * `nextSequence` stores the *next* number to hand out. The statement returns the
 * post-increment value, so the number allocated to this caller is `returned - 1`
 * (a fresh row is seeded with `nextSequence = 2`, i.e. this caller takes 1).
 */

/** Minimal structural type satisfied by both the base client and a `$transaction` client. */
export type SqlRunner = {
  $queryRaw<T = unknown>(query: Prisma.Sql, ...values: unknown[]): Promise<T>;
};

export async function allocateDocumentNumber(
  client: SqlRunner,
  tenantId: string,
  entity: string,
  period: string
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ nextSequence: number | bigint }>>(Prisma.sql`
    INSERT INTO "DocumentSequence" ("tenantId", "entity", "period", "nextSequence", "updatedAt")
    VALUES (${tenantId}, ${entity}, ${period}, 2, now())
    ON CONFLICT ("tenantId", "entity", "period")
    DO UPDATE SET "nextSequence" = "DocumentSequence"."nextSequence" + 1, "updatedAt" = now()
    RETURNING "nextSequence"
  `);
  const stored = Number(rows[0]?.nextSequence ?? 2);
  return stored - 1;
}
