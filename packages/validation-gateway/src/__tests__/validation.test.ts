import { describe, it, expect } from 'vitest';
import { validateBody, schemas } from '../index.js';

describe('Validation Gateway', () => {
  it('validates a contact create payload', () => {
    const data = validateBody(schemas.contactCreate, {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
    });
    expect(data.email).toBe('test@example.com');
  });

  it('throws on invalid email', () => {
    expect(() => validateBody(schemas.contactCreate, {
      email: 'not-an-email',
      firstName: 'John',
      lastName: 'Doe',
    })).toThrow();
  });

  it('validates pagination defaults', () => {
    const data = validateBody(schemas.pagination, { page: '2', pageSize: '50' });
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(50);
  });
});
