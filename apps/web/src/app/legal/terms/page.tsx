import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Nexus CRM',
  description: 'The terms governing use of Nexus CRM.',
};

// NOTE: Template content — must be reviewed and localised by legal counsel before
// public launch. Replace bracketed placeholders and confirm liability, warranty,
// and governing-law clauses for your jurisdiction.

export default function TermsPage(): JSX.Element {
  return (
    <div className="space-y-6 text-sm leading-relaxed text-on-surface">
      <div>
        <h1 className="text-3xl font-bold text-on-surface">Terms of Service</h1>
        <p className="mt-2 text-on-surface-variant">Last updated: [DATE] · Template pending counsel review</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">1. Agreement</h2>
        <p>
          These Terms govern your access to and use of Nexus CRM provided by [COMPANY LEGAL
          NAME]. By using the service you agree to these Terms. If you use the service on
          behalf of an organisation, you represent that you are authorised to bind it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">2. Accounts &amp; access</h2>
        <p>
          You are responsible for your account credentials and for activity under your
          account. Administrators of your tenant control user provisioning and role-based
          permissions. Notify us promptly of any unauthorised access.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">3. Acceptable use</h2>
        <p>
          You agree not to misuse the service: no unlawful content, no attempts to breach
          security or tenant isolation, no interference with other customers, and no
          reverse engineering except as permitted by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">4. Customer data</h2>
        <p>
          You retain ownership of the data you submit. You grant us the rights needed to
          host and process it to provide the service. Our handling of personal data is
          described in the <a href="/legal/privacy" className="text-brand-700 underline">Privacy Policy</a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">5. Availability &amp; support</h2>
        <p>
          We aim for high availability but do not guarantee uninterrupted service unless a
          separate SLA applies. Planned maintenance and support terms are described at
          [SLA / SUPPORT URL].
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">6. Fees</h2>
        <p>Fees, billing cycles, and renewal terms are as set out in your order or plan at [PRICING URL].</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">7. Warranties &amp; liability</h2>
        <p>
          The service is provided &quot;as is&quot; to the extent permitted by law. [INSERT
          WARRANTY DISCLAIMER AND LIABILITY CAP — counsel to confirm.] Nothing limits
          liability that cannot be limited under applicable law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">8. Termination</h2>
        <p>
          Either party may terminate per your order terms. On termination we make your data
          available for export for [EXPORT WINDOW] and then delete it per our retention schedule.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-on-surface">9. Governing law</h2>
        <p>These Terms are governed by the laws of [JURISDICTION], without regard to conflict-of-laws rules.</p>
      </section>
    </div>
  );
}
