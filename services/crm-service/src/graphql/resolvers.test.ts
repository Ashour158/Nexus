import { describe, expect, it } from 'vitest';
import { resolvers } from './resolvers.js';

describe('CRM GraphQL quote read retirement', () => {
  it('does not expose legacy quote read resolvers backed by crm Quote tables', () => {
    expect('quotes' in resolvers.Query).toBe(false);
    expect('quote' in resolvers.Query).toBe(false);
  });
});
