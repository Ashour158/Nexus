import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const COST_FACTOR = 2 ** 14; // ~16k iterations (OWASP recommended minimum)

export interface HashResult {
  hash: string;
  salt: string;
}

/**
 * Hash a password using scrypt with a random salt.
 * Returns a composite string: scrypt$cost$salt$hash (base64url).
 * (Legacy hashes without the algorithm tag — cost$salt$hash — still verify.)
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(plaintext, salt, KEY_LENGTH);

  const saltB64 = salt.toString('base64url');
  const hashB64 = (derived as Buffer).toString('base64url');
  return `scrypt$${COST_FACTOR}$${saltB64}$${hashB64}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash.
 *
 * Accepts the tagged format `scrypt$cost$salt$hash` and the legacy untagged
 * `cost$salt$hash`. Throws for any other recognized-but-unsupported algorithm
 * tag (e.g. `bcrypt$...`) so a foreign hash is a loud error, not a silent
 * login failure.
 */
export async function verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
  if (!plaintext || !storedHash) return false;

  let parts = storedHash.split('$');

  if (parts.length >= 2 && !/^\d+$/.test(parts[0])) {
    if (parts[0] !== 'scrypt') {
      throw new Error(`Unsupported hash algorithm: ${parts[0]}`);
    }
    parts = parts.slice(1);
  }

  if (parts.length !== 3) return false;

  const cost = Number(parts[0]);
  const salt = Buffer.from(parts[1], 'base64url');
  const expectedHash = Buffer.from(parts[2], 'base64url');

  if (!cost || salt.length !== SALT_LENGTH || expectedHash.length !== KEY_LENGTH) {
    return false;
  }

  const derived = await scryptAsync(plaintext, salt, KEY_LENGTH);

  return timingSafeEqual(expectedHash, derived as Buffer);
}

/**
 * Minimum length for NEW/changed passwords. OWASP ASVS allows 8; SOC 2 programs
 * commonly expect >= 12. Raised to 12 as the user-facing policy. The hashing
 * sanity-floor stays at 8 so pre-existing hashes and seeded fixtures still work.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Validate password strength (OWASP ASVS V2.1, SOC2-aligned length).
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH)
    errors.push(`Minimum ${MIN_PASSWORD_LENGTH} characters`);
  if (password.length > 128) errors.push('Maximum 128 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('At least one digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('At least one special character');
  return { valid: errors.length === 0, errors };
}
