import { createRequire } from 'node:module';

/**
 * SMTP email channel. Falls back to a no-op with a warning when SMTP env vars
 * are not configured so local development without a mail server keeps working.
 *
 * `nodemailer` is loaded via `createRequire` so that its type-defs are not
 * required at build time for environments that do not have a mail server.
 * When SMTP is not configured, the module is never required.
 */

interface MailTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
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
}

export interface EmailChannel {
  send(envelope: EmailEnvelope): Promise<void>;
}

export function createEmailChannel(log: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}): EmailChannel {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from =
    process.env.SMTP_FROM?.trim() ||
    'Nexus CRM <no-reply@nexuscrm.local>';

  if (!host) {
    log.warn(
      'SMTP_HOST not configured — email channel will skip sending (dev mode).'
    );
    return {
      async send(envelope) {
        log.info(
          { to: envelope.to, subject: envelope.subject },
          '[email-channel] skipped (no SMTP config)'
        );
      },
    };
  }

  let transporter: MailTransporter;
  try {
    const require = createRequire(import.meta.url);
    const nodemailer = require('nodemailer') as NodemailerModule;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  } catch (err) {
    log.warn(
      { err },
      'nodemailer not installed — email channel will skip sending'
    );
    return {
      async send(envelope) {
        log.info(
          { to: envelope.to, subject: envelope.subject },
          '[email-channel] skipped (nodemailer missing)'
        );
      },
    };
  }

  return {
    async send(envelope) {
      try {
        await transporter.sendMail({
          from,
          to: envelope.to,
          subject: envelope.subject,
          html: envelope.html,
          text: envelope.text ?? stripHtml(envelope.html),
        });
        log.info(
          { to: envelope.to, subject: envelope.subject },
          'email sent'
        );
      } catch (err) {
        log.error({ err, to: envelope.to }, 'email send failed');
      }
    },
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generic template for action-style notifications (subject + call-to-action). */
export function renderActionEmail(opts: {
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footer?: string;
}): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;color:#ffffff;font-weight:bold;font-size:14px;letter-spacing:1px;">
                NEXUS CRM
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 12px 0;font-size:20px;">${escapeHtml(opts.heading)}</h1>
                <p style="margin:0 0 20px 0;line-height:1.5;">${escapeHtml(opts.body)}</p>
                ${
                  opts.actionLabel && opts.actionUrl
                    ? `<a href="${escapeAttr(opts.actionUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;">${escapeHtml(opts.actionLabel)}</a>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;">
                ${escapeHtml(opts.footer ?? 'You are receiving this because you are subscribed to Nexus CRM notifications.')}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
