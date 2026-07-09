import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Nexus CRM',
  description: 'How Nexus CRM collects, uses, and protects personal data.',
};

// NOTE: Template content — must be reviewed and localised by legal counsel before
// public launch. Replace bracketed placeholders and confirm regulatory scope
// (GDPR / CCPA / etc.) for your jurisdictions.

export default function PrivacyPage(): JSX.Element {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-slate-700">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-slate-500">Last updated: [DATE] · Template pending counsel review</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">1. Who we are</h2>
        <p>
          [COMPANY LEGAL NAME] (&quot;we&quot;, &quot;us&quot;) operates Nexus CRM. This policy explains what
          personal data we process, why, and the rights you have. For questions, contact
          our data protection contact at [PRIVACY EMAIL].
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">2. Data we process</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Account data</strong> — name, email, organisation, role, authentication credentials.</li>
          <li><strong>CRM content</strong> — records you create (leads, contacts, accounts, deals, quotes, activities) and their metadata.</li>
          <li><strong>Usage &amp; technical data</strong> — log data, IP address, device/browser info, and audit trails used for security and reliability.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">3. Why we process it (legal bases)</h2>
        <p>
          To provide and secure the service (contract performance), to meet legal
          obligations, and for our legitimate interests in operating, improving, and
          protecting the platform. Where required, processing relies on your consent,
          which you may withdraw at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">4. Multi-tenancy &amp; isolation</h2>
        <p>
          Nexus is multi-tenant. Your organisation&apos;s data is logically isolated and
          scoped to your tenant; users of other tenants cannot access it. Access within
          your tenant is governed by role-based permissions your administrators control.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">5. Sub-processors &amp; sharing</h2>
        <p>
          We use infrastructure and communication sub-processors (hosting, email/SMS
          delivery, error monitoring) listed at [SUB-PROCESSOR LIST URL]. We do not sell
          personal data. We disclose data only to provide the service or where legally
          required.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">6. Retention</h2>
        <p>
          We retain personal data for as long as your account is active and as needed to
          provide the service, then delete or anonymise it per [RETENTION SCHEDULE], subject
          to legal retention requirements.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">7. Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, delete,
          port, or restrict processing of your personal data, and to object to certain
          processing. To exercise these, contact [PRIVACY EMAIL]. You may also lodge a
          complaint with your local supervisory authority.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">8. Security</h2>
        <p>
          We use encryption in transit, role-based access control, tenant isolation, audit
          logging, and regular backups. No system is perfectly secure; we work to protect
          your data using industry-standard measures.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">9. Changes</h2>
        <p>We will post updates to this policy here and, for material changes, notify you.</p>
      </section>
    </div>
  );
}
