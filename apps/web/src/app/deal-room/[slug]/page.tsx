import { CheckCircle2, Circle, FileText } from 'lucide-react';

async function getDealRoom(slug: string) {
  const base = process.env.CRM_SERVICE_URL || 'http://localhost:3001';
  const res = await fetch(`${base}/api/v1/deal-rooms/${slug}/public`, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: PublicRoom };
  return json.data ?? null;
}

type PublicRoom = {
  title: string;
  items: Array<{
    id: string;
    title: string;
    owner: string;
    completedAt?: string | Date | null;
    dueDate?: string | Date | null;
  }>;
  documents: Array<{ id: string; name: string; url: string; fileType?: string | null }>;
};

export default async function PublicDealRoomPage({ params }: { params: { slug: string } }) {
  const room = await getDealRoom(params.slug);

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-container-low">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-on-surface">Deal Room Not Found</h1>
          <p className="text-on-surface-variant">This link may have expired or been unpublished.</p>
        </div>
      </div>
    );
  }

  const repItems = room.items.filter((i) => i.owner === 'rep');
  const buyerItems = room.items.filter((i) => i.owner === 'buyer');
  const progress =
    room.items.length > 0
      ? Math.round(
          (room.items.filter((i) => Boolean(i.completedAt)).length / room.items.length) * 100
        )
      : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-white px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-bold text-on-surface">{room.title}</h1>
          <p className="text-sm text-on-surface-variant">Shared deal workspace</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-outline-variant bg-surface p-4">
          <div className="flex justify-between text-sm text-on-surface-variant">
            <span>Overall progress</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {[
          { title: '🧑‍💼 Sales team actions', items: repItems },
          { title: '🤝 Your actions', items: buyerItems },
        ].map(({ title, items }) => (
          <div key={title} className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-5">
            <h2 className="font-semibold text-on-surface">{title}</h2>
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                {item.completedAt ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-outline" />
                )}
                <div>
                  <p
                    className={`text-sm ${item.completedAt ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}
                  >
                    {item.title}
                  </p>
                  {item.dueDate ? (
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      Due{' '}
                      {new Date(
                        typeof item.dueDate === 'string' ? item.dueDate : item.dueDate
                      ).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {items.length === 0 ? <p className="text-sm italic text-on-surface-variant">No items</p> : null}
          </div>
        ))}

        {room.documents.length > 0 ? (
          <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-5">
            <h2 className="font-semibold text-on-surface">📄 Documents</h2>
            {room.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:text-on-primary-container hover:underline"
              >
                <FileText className="h-4 w-4" /> {doc.name}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
