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

interface NodemailerModule {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
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
      await transporter.sendMail({
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
                  contentType: 'text/calendar; charset=utf-8; method=' +
                    (envelope.ics.method ?? 'REQUEST'),
                },
              ],
            }
          : {}),
        ...(envelope.messageId ? { messageId: envelope.messageId } : {}),
        ...(envelope.inReplyTo ? { inReplyTo: envelope.inReplyTo } : {}),
        ...(envelope.references ? { references: envelope.references } : {}),
      });
    },
  };
}
