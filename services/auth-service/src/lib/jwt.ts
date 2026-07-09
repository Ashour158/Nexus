import { SignJWT, jwtVerify, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';

interface KeyRecord {
  kid: string;
  privateKey: KeyLike;
  publicKey: KeyLike;
  createdAt: Date;
  deprecatedAt?: Date;
}

export interface JwksKeyStoreOptions {
  /** Number of days before a key is rotated (default 90). */
  rotationDays?: number;
}

/**
 * Manages a rotating set of RS256 signing keys.
 *
 * - `sign()` always uses the latest active key and embeds the `kid` header.
 * - `verify()` looks up the key by `kid` and validates the signature.
 * - `rotateKeys()` deprecates old keys and removes expired ones.
 * - `getJwks()` exports public keys in JWKS format for consuming services.
 */
export class JwksKeyStore {
  private keys: KeyRecord[] = [];
  private readonly rotationDays: number;

  constructor(options: JwksKeyStoreOptions = {}) {
    this.rotationDays = options.rotationDays ?? Number(process.env.JWT_ROTATION_DAYS ?? 90);
  }

  /** Generate a new RS256 key pair and return its kid. */
  async generateKeyPair(): Promise<string> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 3072 });
    const kid = crypto.randomUUID();
    this.keys.push({ kid, privateKey, publicKey, createdAt: new Date() });
    // Hard limit to prevent unbounded memory growth on long-running pods
    if (this.keys.length > 10) {
      this.keys = this.keys.slice(-5);
    }
    return kid;
  }

  /** Sign a JWT payload with the latest active key. */
  async sign(payload: Record<string, unknown>, options?: { expiresIn?: string }): Promise<string> {
    const key = this.getLatestKey();
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: key.kid })
      .setIssuedAt()
      .setExpirationTime(options?.expiresIn ?? '1h')
      .sign(key.privateKey);
  }

  /** Verify a JWT by looking up the key identified by `kid`. */
  async verify(token: string): Promise<{ payload: Record<string, unknown>; protectedHeader: Record<string, unknown> }> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { kid?: string };
    const kid = header.kid;
    if (!kid) throw new Error('Token missing kid header');

    const key = this.keys.find((k) => k.kid === kid);
    if (!key) throw new Error(`Unknown key id: ${kid}`);

    const { payload, protectedHeader } = await jwtVerify(token, key.publicKey, { clockTolerance: 60 });
    return { payload: payload as Record<string, unknown>, protectedHeader: protectedHeader as Record<string, unknown> };
  }

  /** Mark old keys as deprecated and remove keys that have been deprecated too long. */
  rotateKeys(): void {
    const now = new Date();
    for (const key of this.keys) {
      if (!key.deprecatedAt && this.isExpired(key.createdAt, now)) {
        key.deprecatedAt = now;
      }
    }
    this.keys = this.keys.filter((k) => {
      if (!k.deprecatedAt) return true;
      const ageMs = now.getTime() - k.deprecatedAt.getTime();
      return ageMs < this.rotationDays * 24 * 60 * 60 * 1000;
    });
  }

  /** Export all active public keys as a JWKS document. */
  async getJwks(): Promise<{ keys: JWK[] }> {
    const jwks = await Promise.all(
      this.keys.map(async (k) => {
        const jwk = (await exportJWK(k.publicKey)) as JWK;
        jwk.kid = k.kid;
        jwk.use = 'sig';
        jwk.alg = 'RS256';
        return jwk;
      })
    );
    return { keys: jwks };
  }

  async importKeyPair(kid: string, privateKeyPem: string, publicKeyPem: string, createdAt: Date = new Date()): Promise<void> {
    const { importPKCS8, importSPKI } = await import('jose');
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    this.keys.push({ kid, privateKey, publicKey, createdAt });
  }

  private getLatestKey(): KeyRecord {
    if (this.keys.length === 0) throw new Error('No keys available in JwksKeyStore');
    return this.keys[this.keys.length - 1];
  }

  private isExpired(createdAt: Date, now: Date): boolean {
    const ageMs = now.getTime() - createdAt.getTime();
    return ageMs >= this.rotationDays * 24 * 60 * 60 * 1000;
  }
}
