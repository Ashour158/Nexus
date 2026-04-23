import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          Nexus CRM
        </p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">
          Enterprise revenue platform
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          CRM, CPQ, billing, forecasting, and AI — unified on a multi-tenant
          event-driven backbone.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <NavCard
          href="/deals"
          title="Pipeline"
          description="Kanban board of open deals across the active pipeline."
        />
        <NavCard
          href="/deals/new"
          title="New deal"
          description="Create a deal with product lines, MEDDICIC scoring, and owner."
        />
        <NavCard
          href="/login"
          title="Sign in"
          description="Authenticate with Keycloak and resume your session."
        />
      </section>
    </main>
  );
}

interface NavCardProps {
  href: string;
  title: string;
  description: string;
}

function NavCard({ href, title, description }: NavCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow"
    >
      <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-700">
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </Link>
  );
}
