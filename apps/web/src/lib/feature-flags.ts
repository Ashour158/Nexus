/**
 * Feature flags for NEXUS CRM.
 * Set flags via environment variables (NEXT_PUBLIC_FF_*) or the flags object below.
 * In production, replace with GrowthBook or LaunchDarkly SDK.
 */

const FLAGS = {
  DEALS_PIPELINE: true,
  CONTACTS: true,
  FINANCE: true,

  CADENCES: envFlag('NEXT_PUBLIC_FF_CADENCES', true),
  TERRITORY: envFlag('NEXT_PUBLIC_FF_TERRITORY', true),
  PLANNING: envFlag('NEXT_PUBLIC_FF_PLANNING', true),
  APPROVALS: envFlag('NEXT_PUBLIC_FF_APPROVALS', true),
  KNOWLEDGE: envFlag('NEXT_PUBLIC_FF_KNOWLEDGE', true),
  INCENTIVES: envFlag('NEXT_PUBLIC_FF_INCENTIVES', true),
  PORTAL: envFlag('NEXT_PUBLIC_FF_PORTAL', true),
  CHATBOT: envFlag('NEXT_PUBLIC_FF_CHATBOT', true),

  AI_SCORING: envFlag('NEXT_PUBLIC_FF_AI_SCORING', false),
  CAMPAIGN_MANAGEMENT: envFlag('NEXT_PUBLIC_FF_CAMPAIGNS', false),
  MOBILE_APP: envFlag('NEXT_PUBLIC_FF_MOBILE', false),
  MULTI_CURRENCY: envFlag('NEXT_PUBLIC_FF_MULTI_CURRENCY', true),
  I18N: envFlag('NEXT_PUBLIC_FF_I18N', true),
} as const;

function envFlag(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return process.env[key] !== undefined ? process.env[key] === 'true' : defaultValue;
  }
  const val = (window as { __NEXUS_FLAGS__?: Record<string, boolean> }).__NEXUS_FLAGS__?.[key];
  return val !== undefined ? val : defaultValue;
}

export type FeatureFlag = keyof typeof FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] ?? false;
}
