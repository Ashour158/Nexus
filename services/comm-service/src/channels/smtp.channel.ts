import { createRequire } from 'node:module';

interface MailAttachment {
  filename: string;
  content: string;
  contentType?: string;
  method?: string;
}

interface MailHeaders {
  [key: string]: string;
}

interface MailTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    icalEvent?: { method?: string; content: string };
    attachments?: MailAttachment[];
    headers?: MailHeaders;
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<unknown>;
}

interface OAuth2Auth {
  type: 'OAuth2';
  user: string;
  accessToken: string;
  refreshToken?: string;
  expires?: number;
}

interface NodemailerModule {
  createTransport(options: {
    host?: string;
    port?: number;
    secure?: boolean;
    service?: string;
    auth?: { user: string; pass: string } | OAuth2Auth;
  }): MailTransporter;
}

export interface EmailEnvelope {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /**
   * Optional RFC-5545 iCalendar body. When present it is sent both as a
   * `text/calendar` alternative (so calendar clients surface an RSVP) and as a
   * downloadable `invite.ics` attachment.
   */
  ics?: { content: string; method?: string };
  /** Stable Message-ID for outbound thread correlation (e.g. `<uid@host>`). */
  messageId?: string;
  /** In-Reply-To header value for reply correlation. */
  inReplyTo?: string;
  /** References header value (space-separated Message-IDs) for threading. */
  references?: string;
}

export interface EmailChannel {
  send(envelope: EmailEnvelope): Promise<void>;
}

export function createSmtpChannel(log: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}): EmailChannel {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from =
    process.env.SMTP_FROM?.trim() || 'Nexus CRM <no-reply@nexuscrm.local>';

  if (!host) {
    log.warn('SMTP_HOST not configured — outbound email is skipped (dev mode).');
    return {
      async send(envelope) {
        log.info(
          { to: envelope.to, subject: envelope.subject, hasIcs: Boolean(envelope.ics) },
          '[smtp] skipped (no SMTP)'
        );
      },
    };
  }

  const require = createRequire(import.meta.url);
  const nodemailer = require('nodemailer') as NodemailerModule;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  return {
    async send(envelope) {
      await transporter.sendMail(buildMailOptions(envelope.from ?? from, envelope));
    },
  };
}

/** Build a nodemailer sendMail() options object from an envelope + resolved from. */
function buildMailOptions(from: string, envelope: EmailEnvelope) {
  return {
    from,
    to: envelope.to,
    subject: envelope.subject,
    html: envelope.html,
    text: envelope.text,
    ...(envelope.ics
      ? {
          icalEvent: { method: envelope.ics.method ?? 'REQUEST', content: envelope.ics.content },
          attachments: [
            {
              filename: 'invite.ics',
              content: envelope.ics.content,
              contentType:
                'text/calendar; charset=utf-8; method=' + (envelope.ics.method ?? 'REQUEST'),
            },
          ],
        }
      : {}),
    ...(envelope.messageId ? { messageId: envelope.messageId } : {}),
    ...(envelope.inReplyTo ? { inReplyTo: envelope.inReplyTo } : {}),
    ...(envelope.references ? { references: envelope.references } : {}),
  };
}

/**
 * Explicit per-account SMTP settings (decrypted) used to build a user-owned
 * transport, independent of the global SMTP_HOST env config.
 */
export interface SmtpAccountSettings {
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
  /** Full RFC-5322 From, e.g. `Jane <jane@acme.com>`. */
  from: string;
}

/** Decrypted OAuth2 settings for a Gmail/Outlook user mailbox. */
export interface OAuthAccountSettings {
  provider: 'GMAIL' | 'OUTLOOK';
  user: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  /** Full RFC-5322 From. */
  from: string;
}

function requireNodemailer(): NodemailerModule {
  const require = createRequire(import.meta.url);
  return require('nodemailer') as NodemailerModule;
}

/**
 * Build an EmailChannel that sends THROUGH a user's own SMTP account. The
 * envelope `from` is ignored; the account's `from` is always used so the
 * recipient sees the registered address.
 */
export function createSmtpChannelFromSettings(settings: SmtpAccountSettings): EmailChannel {
  const nodemailer = requireNodemailer();
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure ?? settings.port === 465,
    auth:
      settings.username && settings.password
        ? { user: settings.username, pass: settings.password }
        : undefined,
  });
  return {
    async send(envelope) {
      await transporter.sendMail(buildMailOptions(settings.from, envelope));
    },
  };
}

/**
 * Build an EmailChannel that sends THROUGH a user's OAuth (Gmail/Outlook)
 * mailbox using a stored access token. Requires nodemailer's OAuth2 transport.
 */
export function createOAuthChannelFromSettings(settings: OAuthAccountSettings): EmailChannel {
  const nodemailer = requireNodemailer();
  const service = settings.provider === 'GMAIL' ? 'gmail' : 'hotmail';
  const transporter = nodemailer.createTransport({
    service,
    auth: {
      type: 'OAuth2',
      user: settings.user,
      accessToken: settings.accessToken,
      refreshToken: settings.refreshToken,
      expires: settings.expiresAt ? settings.expiresAt.getTime() : undefined,
    },
  });
  return {
    async send(envelope) {
      await transporter.sendMail(buildMailOptions(settings.from, envelope));
    },
  };
}

/**
 * Attempt a live SMTP connection/auth check (nodemailer `verify()`), returning a
 * structured result instead of throwing so callers can persist verifiedAt /
 * lastError. Never throws.
 */
export async function verifySmtpSettings(
  settings: SmtpAccountSettings
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const nodemailer = requireNodemailer();
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure ?? settings.port === 465,
      auth:
        settings.username && settings.password
          ? { user: settings.username, pass: settings.password }
          : undefined,
    }) as MailTransporter & { verify?: () => Promise<unknown> };
    if (typeof transporter.verify === 'function') {
      await transporter.verify();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
