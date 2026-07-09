import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { NotesPrisma } from '../prisma.js';

/**
 * @mention parsing → notification fan-out for notes (additive, FAIL-OPEN).
 *
 * A note can mention teammates two ways, both of which the web client emits:
 *
 *   1. Structured `mentions` array on the create/update body — an array of user
 *      cuids (see `CreateNoteSchema`/`UpdateNoteSchema` in `@nexus/validation`).
 *   2. Inline `@[<id>]` tokens embedded in the note `content` (the rich-text
 *      mention widget serialises to this form). Example:
 *        "thanks @[clx123abc] — can you review with @[clx456def]?"
 *
 * We union both sources into a de-duplicated set of mentioned user ids, drop the
 * author (never notify yourself), and emit one `note.mentioned` domain event on
 * {@link TOPICS.NOTIFICATIONS} per newly-mentioned user. The notification-service
 * mention consumer turns each event into a persisted in-app Notification (and
 * re-publishes the realtime `notification.created` push via its in-app channel),
 * so the mentioned user gets a bell notification and a WebSocket push.
 *
 * NOTE ON THE ENVELOPE: this must be a *domain* event (`note.mentioned`), NOT the
 * `notification.created` realtime-push event. `notification.created` on
 * {@link TOPICS.NOTIFICATIONS} is the *output* of the notification pipeline —
 * realtime-service consumes it to fan a WebSocket frame, and nothing persists it.
 * Publishing `notification.created` here (the previous behaviour) therefore never
 * created a Notification row: the mention silently vanished. Following the
 * `deal.won` reference pattern, the source service emits a domain event and the
 * notification-service consumer owns persistence + realtime re-publish.
 *
 * IDEMPOTENCY (per note version): the note row persists a `mentionsNotified`
 * array — the ids we have already notified. We only emit for ids in the current
 * mention set that are NOT yet in `mentionsNotified`, then fold them in. This
 * means:
 *   - re-saving a note with the same @mentions never re-notifies,
 *   - adding a new @mention on an edit notifies only the newly-added user,
 *   - removing then re-adding a mention will NOT re-notify (already recorded) —
 *     an intentional, conservative choice that favours "never spam" over "always
 *     re-nudge".
 *
 * SAFETY: everything here is best-effort. Parsing, the producer publish, and the
 * bookkeeping update are each wrapped so a failure only warns — it can never
 * fail or block the note write that triggered it.
 */

// `@[<cuid>]` — the inline token the mention widget serialises to. cuids are
// `[a-z0-9]` and start with `c`; we keep the class permissive (alphanumeric) so
// the parser is resilient to id-format tweaks, and validate length loosely.
const INLINE_MENTION_RE = /@\[([a-z0-9]{8,})\]/gi;

export interface MentionNote {
  id: string;
  tenantId: string;
  authorId: string;
  content: string;
  mentions?: string[] | null;
  mentionsNotified?: string[] | null;
  dealId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  accountId?: string | null;
}

/** Parse inline `@[id]` tokens out of note content. Returns unique ids. */
export function parseInlineMentions(content: string): string[] {
  if (!content) return [];
  const out = new Set<string>();
  for (const m of content.matchAll(INLINE_MENTION_RE)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/**
 * Compute the full mention set for a note: structured `mentions[]` array unioned
 * with inline `@[id]` tokens in `content`, minus the author.
 */
export function resolveMentions(note: MentionNote): string[] {
  const set = new Set<string>();
  for (const id of note.mentions ?? []) {
    if (id) set.add(id);
  }
  for (const id of parseInlineMentions(note.content)) {
    set.add(id);
  }
  set.delete(note.authorId);
  return [...set];
}

/** Pick the primary CRM record this note hangs off, for notification deep-links. */
function primaryEntity(note: MentionNote): { entityType: string; entityId: string } | null {
  if (note.dealId) return { entityType: 'deal', entityId: note.dealId };
  if (note.contactId) return { entityType: 'contact', entityId: note.contactId };
  if (note.leadId) return { entityType: 'lead', entityId: note.leadId };
  if (note.accountId) return { entityType: 'account', entityId: note.accountId };
  return null;
}

function actionUrlFor(entity: { entityType: string; entityId: string } | null): string {
  if (!entity) return '/notes';
  return `/${entity.entityType}s/${entity.entityId}`;
}

/**
 * Emit `note.mentioned` events for every newly-mentioned user on a note and
 * fold those ids into `mentionsNotified` for idempotency. Best-effort: returns the
 * count actually notified; never throws.
 *
 * `producer` may be undefined (Kafka unavailable at boot) — in that case this is a
 * no-op so the note write path is unaffected.
 */
export async function notifyMentions(
  prisma: NotesPrisma,
  producer: NexusProducer | undefined,
  note: MentionNote
): Promise<number> {
  try {
    if (!producer) return 0;

    const mentioned = resolveMentions(note);
    if (mentioned.length === 0) return 0;

    const alreadyNotified = new Set(note.mentionsNotified ?? []);
    const fresh = mentioned.filter((id) => !alreadyNotified.has(id));
    if (fresh.length === 0) return 0;

    const entity = primaryEntity(note);
    const actionUrl = actionUrlFor(entity);
    const notified: string[] = [];

    for (const userId of fresh) {
      try {
        await producer.publish(TOPICS.NOTIFICATIONS, {
          type: 'note.mentioned',
          tenantId: note.tenantId,
          payload: {
            userId,
            title: 'You were mentioned in a note',
            body:
              note.content.length > 240
                ? `${note.content.slice(0, 237)}...`
                : note.content,
            entityType: entity?.entityType ?? 'note',
            entityId: entity?.entityId ?? note.id,
            actionUrl,
            noteId: note.id,
            authorId: note.authorId,
          },
        });
        notified.push(userId);
      } catch (err) {
        // Per-user failure must not abort the rest of the fan-out.
        console.warn('[notes-mentions] publish failed for user', userId, err);
      }
    }

    if (notified.length > 0) {
      try {
        // Fold notified ids into the persisted set so a later edit / retry never
        // re-notifies the same user for this note. updateMany avoids throwing if
        // the row was concurrently deleted.
        const merged = [...new Set([...(note.mentionsNotified ?? []), ...notified])];
        await prisma.note.updateMany({
          where: { id: note.id, tenantId: note.tenantId },
          data: { mentionsNotified: merged },
        });
      } catch (err) {
        console.warn('[notes-mentions] failed to persist mentionsNotified', err);
      }
    }

    return notified.length;
  } catch (err) {
    // Absolute backstop: mention notification must never fail the note write.
    console.warn('[notes-mentions] notifyMentions failed; continuing', err);
    return 0;
  }
}
