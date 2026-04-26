import { MeetingBookingWidget } from '@/components/calendar/MeetingBookingWidget';

export default function PublicBookingPage({ params }: { params: { repUsername: string } }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <MeetingBookingWidget repUsername={params.repUsername} />
    </main>
  );
}
