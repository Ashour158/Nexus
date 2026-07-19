import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const deprecationReason = 'CPQ mutations moved to finance-service transition authority.';

// Resolve relative to this file, not process.cwd(): in the workspace run the
// worker cwd is the repo root, not services/graphql-gateway.
const schemasDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');

function schema(name: string) {
  return readFileSync(resolve(schemasDir, `${name}.graphql`), 'utf8');
}

describe('GraphQL gateway CPQ authority schema', () => {
  it('does not expose active deals-service quote mutations', () => {
    const deals = schema('deals');

    expect(deals).not.toMatch(/createQuote\s*\(/);
    expect(deals).not.toMatch(/updateQuote\s*\(/);
    expect(deals).not.toMatch(/deleteQuote\s*\(/);
    expect(deals).toMatch(/quotes\s*\(limit:\s*Int,\s*offset:\s*Int\):\s*\[Quote!\]!/);
    expect(deals).toMatch(/quote\s*\(id:\s*ID!\):\s*Quote/);
  });

  it('marks finance quote mutations as deprecated with the CPQ authority reason', () => {
    const finance = schema('finance');

    for (const field of ['createQuote', 'updateQuote', 'deleteQuote']) {
      expect(finance).toMatch(new RegExp(`${field}[^\\n]+@deprecated\\(reason: "${deprecationReason}"\\)`));
    }
    expect(finance).toMatch(/quotes\s*\(limit:\s*Int,\s*offset:\s*Int\):\s*\[Quote!\]!/);
    expect(finance).toMatch(/quote\s*\(id:\s*ID!\):\s*Quote/);
  });
});
