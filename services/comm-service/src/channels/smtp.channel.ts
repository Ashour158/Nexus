import { createRequire } from 'node:module';

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
        log.info({ to: envelope.to, subject: envelope.subject }, '[smtp] skipped (no SMTP)');
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
      });
    },
  };
}
