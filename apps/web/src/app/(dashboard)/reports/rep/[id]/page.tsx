import Link from 'next/link';

export default async function RepDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/reports/manager" className="text-sm text-blue-600 hover:text-blue-700">
        Back to Manager Dashboard
      </Link>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Rep Performance</h1>
        <p className="text-sm text-gray-500">Individual scorecard for rep ID: {params.id}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Full rep detail view will be wired in Prompt 20 (Data Wiring sprint).</p>
      </div>
    </div>
  );
}
