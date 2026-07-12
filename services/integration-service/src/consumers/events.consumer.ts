import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { NexusKafkaEvent } from '@nexus/shared-types';
import type { createWebhooksService } from '../services/webhooks.service.js';
import type { createGoogleCalendarService } from '../services/google-calendar.service.js';
import type { createGeocodingService } from '../services/geocoding.service.js';

type Webhooks = ReturnType<typeof createWebhooksService>;
type Calendar = ReturnType<typeof createGoogleCalendarService>;
type Geocoding = ReturnType<typeof createGeocodingService>;

function registerCrmFanOut(
  consumer: NexusConsumer,
  webhooks: Webhooks,
  calendar?: Calendar,
  geocoding?: Geocoding
): void {
  const forward = async (event: NexusKafkaEvent) => {
    await webhooks.enqueueFromDomainEvent(event);
  };
  const syncActivity = async (event: NexusKafkaEvent) => {
    await forward(event);
    const payload = event.payload as {
      id?: string;
      ownerId?: string;
      subject?: string;
      description?: string | null;
      dueDate?: string | Date | null;
      startDate?: string | Date | null;
      endDate?: string | Date | null;
      duration?: number | null;
    };
    if (!calendar || !payload.id || !payload.ownerId) return;
    await calendar.pushCrmActivityToGoogle(event.tenantId, payload.ownerId, {
      id: payload.id,
      subject: payload.subject,
      description: payload.description,
      dueDate: payload.dueDate,
      startDate: payload.startDate,
      endDate: payload.endDate,
      duration: payload.duration,
    });
  };
  const geocodeAccount = async (event: NexusKafkaEvent) => {
    await forward(event);
    const payload = event.payload as {
      id?: string;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      lat?: number | null;
      lng?: number | null;
    };
    if (!geocoding || !payload.id || (payload.lat && payload.lng)) return;
    const address = [payload.address, payload.city, payload.country].filter(Boolean).join(', ');
    if (!address) return;
    await geocoding.geocodeAccount(event.tenantId, payload.id, address);
  };

  // Generic outbound fan-out: every domain event listed here is forwarded to
  // `enqueueFromDomainEvent`, which filters by each subscription's `events[]`.
  // NexusConsumer dispatches by exact `event.type`, so the set must be explicit.
  // The four events with a CRM side-effect (activity calendar-sync, account
  // geocode) are registered separately below and forward internally — they are
  // intentionally EXCLUDED here to avoid double-enqueue.
  const FORWARD_EVENT_TYPES = [
    // leads
    'lead.created', 'lead.updated', 'lead.deleted', 'lead.qualified',
    'lead.converted', 'lead.assigned',
    // deals
    'deal.created', 'deal.updated', 'deal.deleted', 'deal.stage_changed',
    'deal.won', 'deal.lost', 'deal.reopened',
    // contacts
    'contact.created', 'contact.updated', 'contact.deleted',
    // accounts (account.created/updated handled by geocodeAccount below)
    'account.deleted',
    // activities (activity.created/updated handled by syncActivity below)
    'activity.completed', 'activity.deleted',
    // quotes (finance)
    'quote.created', 'quote.updated', 'quote.created_from_rfq',
    'quote.revision_created', 'quote.submitted_for_approval', 'quote.approved',
    'quote.rejected', 'quote.sent', 'quote.signature_requested', 'quote.signed',
    'quote.accepted', 'quote.expired', 'quote.voided', 'quote.converted_to_order',
  ];
  for (const type of FORWARD_EVENT_TYPES) consumer.on(type, forward);

  consumer.on('activity.created', syncActivity);
  consumer.on('activity.updated', syncActivity);
  consumer.on('account.created', geocodeAccount);
  consumer.on('account.updated', geocodeAccount);
}

export async function startIntegrationEventsConsumer(
  webhooks: Webhooks,
  calendar?: Calendar,
  geocoding?: Geocoding
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('integration-service.crm-fanout');
  registerCrmFanOut(consumer, webhooks, calendar, geocoding);
  await consumer.subscribe([
    TOPICS.DEALS,
    TOPICS.CONTACTS,
    TOPICS.LEADS,
    TOPICS.ACTIVITIES,
    TOPICS.ACCOUNTS,
    TOPICS.QUOTES,
  ]);
  await consumer.start();
  return consumer;
}
