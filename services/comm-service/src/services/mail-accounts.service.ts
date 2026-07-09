import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { CommPrisma } from '../prisma.js';
import type { FieldCrypto } from '../lib/field-crypto.js';
import {
  createOAuthChannelFromSettings,
  createSmtpChannelFromSettings,
  verifySmtpSettings,
  type EmailChannel,
} from '../channels/smtp.channel.js';

export type MailProvider = 'SMTP' | 'GMAIL' | 'OUTLOOK';

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
}

export interface OAuthConfigInput {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CreateMailAccountInput {
  provider: MailProvider;
  displayName: string;
  fromEmail: string;
  fromName?: string;
  isDefault?: boolean;
  smtp?: SmtpConfigInput;
  oauth?: OAuthConfigInput;
}

export interface UpdateMailAccountInput {
  displayName?: string;
  fromName?: string;
  isActive?: boolean;
  smtp?: SmtpConfigInput;
  oauth?: OAuthConfigInput;
}

/** Compose an RFC-5322 From header from name + email. */
function composeFrom(fromEmail: string, fromName?: string | null): string {
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

/**
 * Public, secret-free view of a MailAccount. Encrypted blobs are NEVER returned;
 * presence is exposed via booleans + masked identifiers so the UI can show
 * "configured" state without leaking credentials.
 */
export function maskMailAccount(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    provider: row.provider,
    displayName: row.displayName,
    fromEmail: row.fromEmail,
    fromName: row.fromName ?? null,
    isDefault: row.isDefault,
    isActive: row.isActive,
    verifiedAt: row.verifiedAt ?? null,
    lastError: row.lastError ?? null,
    smtp:
      row.provider === 'SMTP'
        ? {
            host: row.smtpHost ?? null,
            port: row.smtpPort ?? null,
            secure: row.smtpSecure ?? null,
            username: row.smtpUsername ?? null,
            hasPassword: Boolean(row.smtpPasswordEnc),
          }
        : null,
    oauth:
      row.provider === 'GMAIL' || row.provider === 'OUTLOOK'
        ? {
            connected: Boolean(row.oauthAccessTokenEnc),
            expiresAt: row.oauthExpiresAt ?? null,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createMailAccountsService(prisma: CommPrisma, crypto: FieldCrypto) {
  const db = () => (prisma as any).mailAccount;

  /** Load a row the caller owns, or throw NotFound. Owner + tenant scoped. */
  async function ownedOrThrow(tenantId: string, userId: string, id: string) {
    const row = await db().findFirst({ where: { id, tenantId, userId } });
    if (!row) throw new NotFoundError('MailAccount', id);
    return row;
  }

  /** Build encrypted SMTP columns from plaintext config. */
  function encSmtp(cfg: SmtpConfigInput) {
    return {
      smtpHost: cfg.host,
      smtpPort: cfg.port,
      smtpSecure: cfg.secure ?? cfg.port === 465,
      smtpUsername: cfg.username ?? null,
      smtpPasswordEnc: cfg.password ? crypto.encrypt(cfg.password) : null,
    };
  }

  /** Build encrypted OAuth columns from plaintext tokens. */
  function encOAuth(cfg: OAuthConfigInput) {
    return {
      oauthAccessTokenEnc: crypto.encrypt(cfg.accessToken),
      oauthRefreshTokenEnc: cfg.refreshToken ? crypto.encrypt(cfg.refreshToken) : null,
      oauthExpiresAt: cfg.expiresAt ?? null,
    };
  }

  return {
    /** List the caller's own mail accounts (masked). */
    async listMine(tenantId: string, userId: string) {
      const rows = await db().findMany({
        where: { tenantId, userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      return rows.map(maskMailAccount);
    },

    async getMine(tenantId: string, userId: string, id: string) {
      return maskMailAccount(await ownedOrThrow(tenantId, userId, id));
    },

    /** Register a new mail account for the caller. Secrets encrypted on write. */
    async create(tenantId: string, userId: string, input: CreateMailAccountInput) {
      if (input.provider === 'SMTP') {
        if (!input.smtp?.host || !input.smtp?.port) {
          throw new ValidationError('SMTP host and port are required for provider SMTP.');
        }
      } else if (input.oauth && !input.oauth.accessToken) {
        throw new ValidationError('OAuth accessToken is required when oauth config is supplied.');
      }

      const providerCols =
        input.provider === 'SMTP'
          ? input.smtp
            ? encSmtp(input.smtp)
            : {}
          : input.oauth
            ? encOAuth(input.oauth)
            : {};

      const makeDefault = input.isDefault ?? false;

      const created = await (prisma as any).$transaction(async (tx: any) => {
        if (makeDefault) {
          await tx.mailAccount.updateMany({
            where: { tenantId, userId, isDefault: true },
            data: { isDefault: false },
          });
        }
        // First account for the user becomes the default automatically.
        const existing = await tx.mailAccount.count({ where: { tenantId, userId } });
        return tx.mailAccount.create({
          data: {
            tenantId,
            userId,
            provider: input.provider,
            displayName: input.displayName,
            fromEmail: input.fromEmail,
            fromName: input.fromName ?? null,
            isDefault: makeDefault || existing === 0,
            isActive: true,
            ...providerCols,
          },
        });
      });
      return maskMailAccount(created);
    },

    /** Update mutable fields / rotate secrets. Owner scoped. */
    async update(tenantId: string, userId: string, id: string, input: UpdateMailAccountInput) {
      const row = await ownedOrThrow(tenantId, userId, id);
      const data: any = {};
      if (input.displayName !== undefined) data.displayName = input.displayName;
      if (input.fromName !== undefined) data.fromName = input.fromName;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.smtp) {
        Object.assign(data, encSmtp(input.smtp));
        // Re-verification required after a credential change.
        data.verifiedAt = null;
      }
      if (input.oauth) {
        Object.assign(data, encOAuth(input.oauth));
        data.verifiedAt = null;
      }
      const updated = await db().update({ where: { id: row.id }, data });
      return maskMailAccount(updated);
    },

    /** Delete an owned account. If it was the default, promote another. */
    async remove(tenantId: string, userId: string, id: string) {
      const row = await ownedOrThrow(tenantId, userId, id);
      await (prisma as any).$transaction(async (tx: any) => {
        await tx.mailAccount.delete({ where: { id: row.id } });
        if (row.isDefault) {
          const next = await tx.mailAccount.findFirst({
            where: { tenantId, userId },
            orderBy: { createdAt: 'asc' },
          });
          if (next) {
            await tx.mailAccount.update({ where: { id: next.id }, data: { isDefault: true } });
          }
        }
      });
      return { id: row.id, deleted: true };
    },

    /** Make an owned account the caller's single default. */
    async setDefault(tenantId: string, userId: string, id: string) {
      const row = await ownedOrThrow(tenantId, userId, id);
      const updated = await (prisma as any).$transaction(async (tx: any) => {
        await tx.mailAccount.updateMany({
          where: { tenantId, userId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.mailAccount.update({ where: { id: row.id }, data: { isDefault: true } });
      });
      return maskMailAccount(updated);
    },

    /**
     * Live connection test. SMTP → nodemailer verify(). OAuth → confirm a token
     * is stored (a full provider round-trip is out of scope). Persists verifiedAt
     * or lastError and never throws for provider-side failures.
     */
    async verify(tenantId: string, userId: string, id: string) {
      const row = await ownedOrThrow(tenantId, userId, id);
      let result: { ok: true } | { ok: false; error: string };
      if (row.provider === 'SMTP') {
        if (!row.smtpHost || !row.smtpPort) {
          result = { ok: false, error: 'SMTP host/port not configured.' };
        } else {
          result = await verifySmtpSettings({
            host: row.smtpHost,
            port: row.smtpPort,
            secure: row.smtpSecure ?? undefined,
            username: row.smtpUsername ?? undefined,
            password: row.smtpPasswordEnc ? crypto.decrypt(row.smtpPasswordEnc) : undefined,
            from: composeFrom(row.fromEmail, row.fromName),
          });
        }
      } else {
        result = row.oauthAccessTokenEnc
          ? { ok: true }
          : { ok: false, error: `${row.provider} account is not connected (no OAuth token).` };
      }
      const updated = await db().update({
        where: { id: row.id },
        data: result.ok
          ? { verifiedAt: new Date(), lastError: null }
          : { verifiedAt: null, lastError: result.error },
      });
      return { verified: result.ok, account: maskMailAccount(updated) };
    },

    /**
     * Resolve a ready-to-use EmailChannel that sends THROUGH the given account.
     * Used by the outbox send path. Throws a clear error (never returns a broken
     * channel) if the account is missing, inactive, or lacks usable creds — the
     * caller marks the message FAILED without crashing the worker.
     */
    async getSendChannel(tenantId: string, mailAccountId: string): Promise<EmailChannel> {
      const row = await db().findFirst({ where: { id: mailAccountId, tenantId } });
      if (!row) throw new Error(`MailAccount ${mailAccountId} not found for tenant.`);
      if (!row.isActive) throw new Error(`MailAccount ${mailAccountId} is inactive.`);
      const from = composeFrom(row.fromEmail, row.fromName);

      if (row.provider === 'SMTP') {
        if (!row.smtpHost || !row.smtpPort) {
          throw new Error(`MailAccount ${mailAccountId} has no SMTP host/port configured.`);
        }
        return createSmtpChannelFromSettings({
          host: row.smtpHost,
          port: row.smtpPort,
          secure: row.smtpSecure ?? undefined,
          username: row.smtpUsername ?? undefined,
          password: row.smtpPasswordEnc ? crypto.decrypt(row.smtpPasswordEnc) : undefined,
          from,
        });
      }

      // GMAIL / OUTLOOK
      if (!row.oauthAccessTokenEnc) {
        throw new Error(
          `MailAccount ${mailAccountId} (${row.provider}) is not connected — no OAuth token.`
        );
      }
      return createOAuthChannelFromSettings({
        provider: row.provider === 'GMAIL' ? 'GMAIL' : 'OUTLOOK',
        user: row.fromEmail,
        accessToken: crypto.decrypt(row.oauthAccessTokenEnc),
        refreshToken: row.oauthRefreshTokenEnc ? crypto.decrypt(row.oauthRefreshTokenEnc) : undefined,
        expiresAt: row.oauthExpiresAt ?? null,
        from,
      });
    },
  };
}

export type MailAccountsService = ReturnType<typeof createMailAccountsService>;
