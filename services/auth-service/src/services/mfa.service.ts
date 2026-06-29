import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { AuthPrisma } from '../prisma.js';

const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'fallback-key-min-32-chars-long!!';

function deriveKey(): Buffer {
  return createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSecret(ciphertext: string): string {
  const key = deriveKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 16);
  const authTag = buf.subarray(16, 32);
  const encrypted = buf.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

export interface MfaSetupResult {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export async function setupMfa(
  prisma: AuthPrisma,
  userId: string,
  email: string
): Promise<MfaSetupResult> {
  const existing = await prisma.mfaConfiguration.findUnique({ where: { userId } });
  if (existing?.enabledAt) {
    throw new Error('MFA is already enabled. Disable first to reconfigure.');
  }

  const secret = new Secret({ size: 32 });
  const totp = new TOTP({
    issuer: process.env.MFA_ISSUER ?? 'NEXUS CRM',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());
  const backupCodes = Array.from({ length: 10 }, () => randomBytes(4).toString('hex').toUpperCase());
  const hashedBackupCodes = backupCodes.map((code) => createHash('sha256').update(code).digest('hex'));

  const encryptedSecret = encryptSecret(secret.base32);

  await prisma.mfaConfiguration.upsert({
    where: { userId },
    create: {
      userId,
      secret: encryptedSecret,
      method: 'TOTP',
      backupCodes: hashedBackupCodes,
    },
    update: {
      secret: encryptedSecret,
      method: 'TOTP',
      backupCodes: hashedBackupCodes,
      enabledAt: null,
      lastVerifiedAt: null,
    },
  });

  return { secret: secret.base32, qrCodeDataUrl, backupCodes };
}

export async function verifyAndEnableMfa(
  prisma: AuthPrisma,
  userId: string,
  code: string
): Promise<void> {
  const config = await prisma.mfaConfiguration.findUnique({ where: { userId } });
  if (!config) throw new Error('MFA not configured');
  if (config.enabledAt) throw new Error('MFA is already enabled');

  const isValid = await verifyMfaCode(prisma, userId, code);
  if (!isValid) throw new Error('Invalid TOTP code');

  await prisma.mfaConfiguration.update({
    where: { userId },
    data: { enabledAt: new Date(), lastVerifiedAt: new Date() },
  });
}

export async function verifyMfaCode(
  prisma: AuthPrisma,
  userId: string,
  code: string
): Promise<boolean> {
  const config = await prisma.mfaConfiguration.findUnique({ where: { userId } });
  if (!config || !config.enabledAt) return false;

  // Check TOTP
  const secretBase32 = decryptSecret(config.secret);
  const totp = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta !== null) {
    await prisma.mfaConfiguration.update({
      where: { userId },
      data: { lastVerifiedAt: new Date() },
    });
    return true;
  }

  // Check backup codes
  const backupCodes = config.backupCodes as string[];
  const hashedInput = createHash('sha256').update(code).digest('hex');
  const idx = backupCodes.indexOf(hashedInput);
  if (idx !== -1) {
    const updated = [...backupCodes];
    updated.splice(idx, 1);
    await prisma.mfaConfiguration.update({
      where: { userId },
      data: { backupCodes: updated, lastVerifiedAt: new Date() },
    });
    return true;
  }

  return false;
}

export async function disableMfa(
  prisma: AuthPrisma,
  userId: string,
  code: string
): Promise<void> {
  const config = await prisma.mfaConfiguration.findUnique({ where: { userId } });
  if (!config || !config.enabledAt) throw new Error('MFA is not enabled');

  const isValid = await verifyMfaCode(prisma, userId, code);
  if (!isValid) throw new Error('Invalid TOTP code');

  await prisma.mfaConfiguration.delete({ where: { userId } });
}

export async function isMfaEnabled(prisma: AuthPrisma, userId: string): Promise<boolean> {
  const config = await prisma.mfaConfiguration.findUnique({
    where: { userId },
    select: { enabledAt: true },
  });
  return !!config?.enabledAt;
}

export async function regenerateBackupCodes(
  prisma: AuthPrisma,
  userId: string,
  code: string
): Promise<string[]> {
  const config = await prisma.mfaConfiguration.findUnique({ where: { userId } });
  if (!config || !config.enabledAt) throw new Error('MFA is not enabled');

  const isValid = await verifyMfaCode(prisma, userId, code);
  if (!isValid) throw new Error('Invalid TOTP code');

  const backupCodes = Array.from({ length: 10 }, () => randomBytes(4).toString('hex').toUpperCase());
  const hashedBackupCodes = backupCodes.map((c) => createHash('sha256').update(c).digest('hex'));

  await prisma.mfaConfiguration.update({
    where: { userId },
    data: { backupCodes: hashedBackupCodes },
  });

  return backupCodes;
}
