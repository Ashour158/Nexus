import type { ConversationState } from '../../../../node_modules/.prisma/chatbot-client/index.js';
import type { Conversation } from '../../../../node_modules/.prisma/chatbot-client/index.js';
import type { NexusProducer } from '@nexus/kafka';
import type { ChatbotPrisma } from '../prisma.js';
import { matchIntent } from './intents.js';
import { emitHandoff } from './handoff.service.js';

export type FsmResult = {
  reply: string;
  newState: ConversationState;
  updatedContext?: Record<string, unknown>;
  /** Set when the message was escalated to a human this turn. */
  handoff?: boolean;
};

function internalHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
  };
}

/**
 * Session state machine + rules-only intent routing orchestrator.
 *
 * Session lifecycle (per Conversation.state):
 *   IDLE ──greeting──▶ GREETING ─▶ COLLECTING_INFO ─▶ PRODUCT_SEARCH
 *        ─▶ QUOTE_BUILDING ─▶ QUOTE_REVIEW ─▶ QUOTE_SENT ─▶ COMPLETE
 *   Any state ──"agent" / no-match──▶ HANDED_OFF   (escalated to a human)
 *   HANDED_OFF / CLOSED ──"restart"/"start"──▶ IDLE (customer re-engages)
 *
 * Ordering per turn:
 *   1. If the session is already HANDED_OFF/CLOSED, only a restart re-opens it;
 *      otherwise we stay parked so a human owns the thread.
 *   2. Rules-only intent match (keyword/regex, deterministic — NO AI):
 *        - AGENT      → emit handoff event, mark HANDED_OFF
 *        - HELP/GREETING/GOODBYE → canned reply, state unchanged
 *        - RESTART    → reset to IDLE
 *        - QUOTE      → fall through to the quote FSM
 *   3. No intent + mid-quote-flow → continue the quote FSM.
 *   4. No intent + not in a flow (IDLE) → fail-safe handoff so nothing is dropped.
 *
 * Additive + fail-open: if intent matching or the quote FSM throws, we fall back
 * to a human handoff rather than crashing the webhook.
 */
export async function processMessage(
  conversation: Conversation,
  message: string,
  prisma: ChatbotPrisma,
  producer?: NexusProducer | null
): Promise<FsmResult> {
  try {
    // 1. Parked with a human — only an explicit restart re-opens the bot.
    if (conversation.state === 'HANDED_OFF' || conversation.state === 'CLOSED') {
      const parkedIntent = safeMatchIntent(message);
      if (parkedIntent?.action.kind === 'restart') {
        return {
          reply: `Okay, starting over. Reply with a product name or "quote" to begin.`,
          newState: 'IDLE',
          updatedContext: {},
        };
      }
      return {
        reply: `You're connected to our team — someone will follow up shortly. Reply RESTART to talk to the bot again.`,
        newState: conversation.state,
      };
    }

    // 2. Rules-only intent routing.
    const intent = safeMatchIntent(message);
    if (intent) {
      switch (intent.action.kind) {
        case 'handoff':
          return await handoffResult(conversation, message, intent.action.reason, producer);
        case 'reply':
          return { reply: intent.action.reply, newState: conversation.state };
        case 'restart':
          return {
            reply: `No problem — let's start fresh. What product or service are you looking for?`,
            newState: 'IDLE',
            updatedContext: {},
          };
        case 'quote':
          // Fall through to the quote FSM below (kick off from IDLE if needed).
          break;
      }
    }

    // 3./4. No short-circuiting intent — run the quote FSM. When the session is
    // IDLE and nothing matched (and it wasn't an explicit quote intent), there is
    // no flow to advance, so escalate rather than silently drop the message.
    if (!intent && conversation.state === 'IDLE') {
      return await handoffResult(conversation, message, 'no_intent_match', producer);
    }

    return await runQuoteFsm(conversation, message, prisma);
  } catch (err) {
    // Fail-open: never throw out of the message handler. Escalate to a human.
    console.warn('processMessage: unexpected error, falling back to handoff:', err);
    return await handoffResult(conversation, message, 'processing_error', producer);
  }
}

/** Intent matching that never throws — errors degrade to "no match". */
function safeMatchIntent(message: string): ReturnType<typeof matchIntent> {
  try {
    return matchIntent(message);
  } catch (err) {
    console.warn('safeMatchIntent: intent matching failed, treating as no match:', err);
    return null;
  }
}

/** Emit the handoff event (fail-open) and return the HANDED_OFF transition. */
async function handoffResult(
  conversation: Conversation,
  message: string,
  reason: string,
  producer?: NexusProducer | null
): Promise<FsmResult> {
  await emitHandoff(producer, {
    conversation: {
      id: conversation.id,
      tenantId: conversation.tenantId,
      channel: conversation.channel,
      externalId: conversation.externalId,
    },
    message,
    reason,
  });
  return {
    reply: `Let me connect you with a member of our team — they'll follow up shortly. Reply RESTART to keep using the bot.`,
    newState: 'HANDED_OFF',
    handoff: true,
  };
}

/** The original deterministic quote-building flow, unchanged. */
async function runQuoteFsm(
  conversation: Conversation,
  message: string,
  _prisma: ChatbotPrisma
): Promise<FsmResult> {
  switch (conversation.state) {
    case 'IDLE':
      return {
        reply: `Hello! I'm the NEXUS quoting assistant. I can help you get a quote. What's your name?`,
        newState: 'GREETING',
      };

    case 'GREETING': {
      const name = message.trim();
      return {
        reply: `Nice to meet you, ${name}! What's your email address?`,
        newState: 'COLLECTING_INFO',
        updatedContext: { name },
      };
    }

    case 'COLLECTING_INFO': {
      const ctx = (conversation.context as Record<string, unknown>) ?? {};
      const email = message.trim();
      const crmRes = await fetch(
        `${process.env.CRM_SERVICE_URL}/api/v1/contacts?search=${encodeURIComponent(email)}`,
        { headers: internalHeaders() }
      );
      const crmData = (await crmRes.json()) as { data: Array<{ id: string }> };
      const contactId = crmData.data[0]?.id ?? null;
      return {
        reply: `Thanks! What product or service are you looking for? (You can search by name)`,
        newState: 'PRODUCT_SEARCH',
        updatedContext: { ...ctx, email, contactId },
      };
    }

    case 'PRODUCT_SEARCH': {
      const ctx = (conversation.context as Record<string, unknown>) ?? {};
      const res = await fetch(
        `${process.env.FINANCE_SERVICE_URL}/api/v1/products?search=${encodeURIComponent(message)}&limit=5`,
        { headers: internalHeaders() }
      );
      const data = (await res.json()) as {
        data: Array<{ id: string; name: string; listPrice: string }>;
      };
      if (data.data.length === 0) {
        return {
          reply: `Sorry, I couldn't find any products matching "${message}". Try a different search term.`,
          newState: 'PRODUCT_SEARCH',
        };
      }
      const list = data.data
        .map((p, i) => `${i + 1}. ${p.name} — ${p.listPrice}`)
        .join('\n');
      return {
        reply: `I found these products:\n${list}\n\nReply with the number(s) you want (e.g. "1" or "1,3"), and specify quantity (e.g. "1 x2").`,
        newState: 'QUOTE_BUILDING',
        updatedContext: { ...ctx, productSearchResults: data.data },
      };
    }

    case 'QUOTE_BUILDING': {
      const ctx = (conversation.context as Record<string, unknown>) ?? {};
      const products = (ctx.productSearchResults as Array<{
        id: string;
        name: string;
        listPrice: string;
      }>) ?? [];
      const selections = parseProductSelections(message, products);
      if (selections.length === 0) {
        return {
          reply: `I didn't understand that. Please reply with numbers like "1 x2" or "1,2".`,
          newState: 'QUOTE_BUILDING',
        };
      }
      const lineItems = selections.map((s) => ({
        productId: s.product.id,
        name: s.product.name,
        qty: s.qty,
        unitPrice: s.product.listPrice,
        discount: '0',
        total: (parseFloat(s.product.listPrice) * s.qty).toFixed(2),
      }));
      const grandTotal = lineItems
        .reduce((sum, li) => sum + parseFloat(li.total), 0)
        .toFixed(2);
      const summary = lineItems.map((li) => `• ${li.name} x${li.qty} = ${li.total}`).join('\n');
      return {
        reply: `Here's your quote summary:\n${summary}\n\n**Total: ${grandTotal}**\n\nShall I send this quote? Reply YES to confirm or NO to start over.`,
        newState: 'QUOTE_REVIEW',
        updatedContext: { ...ctx, lineItems, grandTotal },
      };
    }

    case 'QUOTE_REVIEW': {
      const ctx = (conversation.context as Record<string, unknown>) ?? {};
      if (message.trim().toUpperCase() === 'YES') {
        await fetch(`${process.env.FINANCE_SERVICE_URL}/api/v1/quotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...internalHeaders(),
          },
          body: JSON.stringify({
            tenantId: conversation.tenantId,
            name: `Chatbot Quote - ${String(ctx.name ?? 'Customer')}`,
            currency: 'USD',
            lineItems: ctx.lineItems,
          }),
        });
        return {
          reply: `Your quote has been created and our team will follow up shortly. Thank you, ${String(ctx.name ?? '')}!`,
          newState: 'QUOTE_SENT',
        };
      }
      return {
        reply: `No problem! What product would you like to search for?`,
        newState: 'PRODUCT_SEARCH',
        updatedContext: { ...ctx, lineItems: undefined, grandTotal: undefined },
      };
    }

    case 'QUOTE_SENT':
    case 'COMPLETE':
      return {
        reply: `Your quote is being processed. Is there anything else I can help you with? Reply START to begin a new quote.`,
        newState: message.trim().toUpperCase() === 'START' ? 'IDLE' : 'COMPLETE',
      };

    default:
      return { reply: `Sorry, I didn't understand that. Reply START to begin.`, newState: 'IDLE' };
  }
}

function parseProductSelections(
  input: string,
  products: Array<{ id: string; name: string; listPrice: string }>
): Array<{ product: (typeof products)[number]; qty: number }> {
  const selections: Array<{ product: (typeof products)[number]; qty: number }> = [];
  const parts = input.split(',').map((p) => p.trim());
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*[xX]\s*(\d+))?$/);
    if (!match) continue;
    const idx = parseInt(match[1], 10) - 1;
    const qty = match[2] ? parseInt(match[2], 10) : 1;
    if (idx >= 0 && idx < products.length) {
      selections.push({ product: products[idx], qty });
    }
  }
  return selections;
}
