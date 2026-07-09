/**
 * Deterministic, rule-based intent routing for the chatbot.
 *
 * This is intentionally NON-AI: intents are matched by keyword/regex rules only.
 * There is no ML/LLM inference and no call to ai-service. Matching is
 * case-insensitive and deterministic — the same input always yields the same
 * intent — so conversations are predictable and testable.
 *
 * The intent layer runs *before* the quote-building FSM in
 * conversation.service.ts. A matched intent can either:
 *   - short-circuit with a canned reply (e.g. HELP, GREETING), or
 *   - request a human handoff (e.g. AGENT), or
 *   - fall through to the existing quote FSM (QUOTE, or NONE when nothing matched).
 */

/** Well-known intent identifiers. Extend by adding a rule below. */
export type IntentId =
  | 'AGENT'
  | 'HELP'
  | 'GREETING'
  | 'GOODBYE'
  | 'QUOTE'
  | 'RESTART';

/** How the conversation engine should act on a matched intent. */
export type IntentAction =
  | { kind: 'reply'; reply: string } // canned response, stay in place
  | { kind: 'handoff'; reason: string } // escalate to a human agent
  | { kind: 'quote' } // enter/continue the quote-building FSM
  | { kind: 'restart' }; // reset the session to IDLE

export interface IntentRule {
  id: IntentId;
  /** Regex patterns (case-insensitive) — any match selects this intent. */
  patterns: RegExp[];
  action: IntentAction;
  /** Lower runs first when several rules could match. */
  priority: number;
}

export interface IntentMatch {
  id: IntentId;
  action: IntentAction;
}

/**
 * Ordered rule set. `AGENT` deliberately has the highest priority so that an
 * explicit request for a human always wins over any other keyword.
 */
export const INTENT_RULES: IntentRule[] = [
  {
    id: 'AGENT',
    priority: 0,
    patterns: [
      /\b(human|agent|representative|rep|person|someone|advisor)\b/i,
      /\b(talk|speak|connect|transfer)\s+(to|with)?\s*(a|an|someone|somebody)?\s*(human|agent|person)\b/i,
      /\b(real\s+person|live\s+chat|live\s+agent|customer\s+support|support\s+team)\b/i,
    ],
    action: { kind: 'handoff', reason: 'customer_requested_agent' },
  },
  {
    id: 'RESTART',
    priority: 1,
    patterns: [/^\s*(restart|start over|reset|begin again|new quote)\s*$/i, /^\s*start\s*$/i],
    action: { kind: 'restart' },
  },
  {
    id: 'GREETING',
    priority: 2,
    patterns: [/^\s*(hi|hello|hey|hiya|good\s+(morning|afternoon|evening)|greetings)\b/i],
    action: {
      kind: 'reply',
      reply:
        "Hi! I'm the NEXUS assistant. I can help you get a quote — just tell me what product or service you're after. Type HELP for options, or ask for an agent any time.",
    },
  },
  {
    id: 'HELP',
    priority: 3,
    patterns: [/^\s*(help|menu|options|what can you do|commands?)\s*$/i, /\bhow (do|can) i\b/i],
    action: {
      kind: 'reply',
      reply:
        'I can help you build a quote. You can say:\n• "quote" — start a new quote\n• a product name — search the catalog\n• "agent" — talk to a human\n• "restart" — start over',
    },
  },
  {
    id: 'GOODBYE',
    priority: 4,
    patterns: [/^\s*(bye|goodbye|thanks?( you)?|that'?s all|no thanks|nothing else)\s*$/i],
    action: {
      kind: 'reply',
      reply: 'Thanks for chatting! Reply START any time to begin a new quote.',
    },
  },
  {
    id: 'QUOTE',
    priority: 5,
    patterns: [/\b(quote|pricing|price|buy|purchase|order|cost|how much)\b/i],
    action: { kind: 'quote' },
  },
];

/**
 * Match a raw inbound message against the configured intent rules.
 * Returns the highest-priority match, or `null` when nothing matches.
 * Rules-only and deterministic — never throws for a normal string input.
 */
export function matchIntent(message: string): IntentMatch | null {
  const text = (message ?? '').toString();
  if (!text.trim()) return null;
  const ordered = [...INTENT_RULES].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    for (const pattern of rule.patterns) {
      // Reset lastIndex defensively in case a rule ever uses the /g flag.
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return { id: rule.id, action: rule.action };
      }
    }
  }
  return null;
}
