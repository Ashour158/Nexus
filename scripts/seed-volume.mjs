#!/usr/bin/env node
// @ts-check

/**
 * Seed realistic CRM volume through the deployed web BFF. This script never
 * writes to a database directly. It is resumable and deliberately conservative
 * about concurrency because production-like environments may enforce rate limits.
 *
 * Example (authoring only; review the target before running):
 *   node scripts/seed-volume.mjs --base https://crm.example.com \
 *     --tenant "Acme Production Test" --email admin@example.com --password '...'
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULTS = Object.freeze({
  accounts: 1_000,
  contacts: 10_000,
  deals: 2_000,
  activities: 20_000,
  concurrency: 5,
});
const MAX_RETRIES = 8;
const REQUEST_TIMEOUT_MS = 30_000;
const CHECKPOINT_EVERY = 50;
const PROGRESS_EVERY_MS = 5_000;

const INDUSTRIES = [
  'Technology', 'Manufacturing', 'Healthcare', 'Financial Services',
  'Retail', 'Energy', 'Logistics', 'Education', 'Media', 'Construction',
];
const CITIES = [
  ['Cairo', 'Egypt'], ['Dubai', 'United Arab Emirates'], ['Riyadh', 'Saudi Arabia'],
  ['London', 'United Kingdom'], ['New York', 'United States'], ['Toronto', 'Canada'],
  ['Singapore', 'Singapore'], ['Berlin', 'Germany'], ['Sydney', 'Australia'],
  ['Cape Town', 'South Africa'],
];
const FIRST_NAMES = [
  'Aisha', 'Omar', 'Mariam', 'Youssef', 'Nour', 'Adam', 'Leila', 'Daniel',
  'Priya', 'Carlos', 'Grace', 'Yuki', 'Elena', 'James', 'Sarah', 'Michael',
];
const LAST_NAMES = [
  'Ashour', 'Hassan', 'Patel', 'Garcia', 'Nguyen', 'Kim', 'Rossi', 'Okafor',
  'Anderson', 'Khan', 'Silva', 'Tanaka', 'Brown', 'Muller', 'Cohen', 'Lopez',
];
const JOB_TITLES = [
  'Chief Executive Officer', 'VP Sales', 'Finance Director', 'Operations Manager',
  'Procurement Lead', 'Solutions Architect', 'Customer Success Director',
  'IT Manager', 'Revenue Operations Lead', 'Product Director',
];
const DEAL_NOUNS = [
  'Enterprise Rollout', 'Annual Renewal', 'Regional Expansion', 'Platform Migration',
  'Managed Services', 'Security Upgrade', 'Analytics Program', 'Support Agreement',
];
const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK', 'FOLLOW_UP', 'NOTE'];

function usage() {
  return `Nexus CRM volume seed (HTTP APIs only)

Required:
  --base URL                 Web origin exposing /bff (for example https://crm.example.com)
  --tenant NAME              Human-readable tenant name used in markers/checkpoint safety
  --email EMAIL              Login email for that tenant
  --password PASSWORD        Login password (or set NEXUS_PASSWORD)

Volume:
  --accounts N               Accounts to create (default ${DEFAULTS.accounts})
  --contacts N               Contacts to create (default ${DEFAULTS.contacts})
  --deals N                  Deals to create (default ${DEFAULTS.deals})
  --activities N             Activities to create (default ${DEFAULTS.activities})
  --concurrency N            Maximum in-flight creates (default ${DEFAULTS.concurrency}, max 50)
  --state-file PATH          Resume checkpoint (default .nexus-volume-seed/<tenant>.json)
  --help                     Show this help

Every record carries a volume-seed marker. The checkpoint contains IDs and
progress only; credentials and tokens are never persisted.`;
}

/**
 * @typedef {{
 *   help: false,
 *   base: string,
 *   tenant: string,
 *   tenantSlug: string,
 *   email: string,
 *   password: string,
 *   accounts: number,
 *   contacts: number,
 *   deals: number,
 *   activities: number,
 *   concurrency: number,
 *   stateFile: string
 * }} SeedConfig
 */

/**
 * @param {string[]} argv
 * @returns {{help: true} | SeedConfig}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const values = {};
  const known = new Set([
    'base', 'tenant', 'email', 'password', 'accounts', 'contacts', 'deals',
    'activities', 'concurrency', 'state-file',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--help' || raw === '-h') return { help: true };
    if (!raw.startsWith('--')) throw new Error(`Unexpected argument: ${raw}`);
    const separator = raw.indexOf('=');
    const key = raw.slice(2, separator === -1 ? undefined : separator);
    if (!known.has(key)) throw new Error(`Unknown flag: --${key}`);
    const value = separator === -1 ? argv[++index] : raw.slice(separator + 1);
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    values[key] = value;
  }

  const required = (key) => {
    const value = values[key]?.trim();
    if (!value) throw new Error(`--${key} is required`);
    return value;
  };
  const count = (key, fallback, max = 1_000_000) => {
    const raw = values[key];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`--${key} must be a non-negative integer`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > max) {
      throw new Error(`--${key} must be between 0 and ${max}`);
    }
    return value;
  };

  const rawBase = required('base');
  const parsedBase = new URL(rawBase);
  if (!['http:', 'https:'].includes(parsedBase.protocol)) throw new Error('--base must use http or https');
  if (parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    throw new Error('--base must not contain credentials, a query, or a fragment');
  }
  parsedBase.pathname = parsedBase.pathname.replace(/\/+$/, '');

  const tenant = required('tenant');
  const tenantSlug = slug(tenant);
  const password = values.password ?? process.env.NEXUS_PASSWORD;
  if (!password) throw new Error('--password is required (or set NEXUS_PASSWORD)');

  return {
    help: false,
    base: parsedBase.toString().replace(/\/$/, ''),
    tenant,
    tenantSlug,
    email: required('email'),
    password,
    accounts: count('accounts', DEFAULTS.accounts),
    contacts: count('contacts', DEFAULTS.contacts),
    deals: count('deals', DEFAULTS.deals),
    activities: count('activities', DEFAULTS.activities),
    concurrency: count('concurrency', DEFAULTS.concurrency, 50),
    stateFile: resolve(values['state-file'] ?? `.nexus-volume-seed/${tenantSlug}.json`),
  };
}

/** @param {string} value */
function slug(value) {
  const result = value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!result) throw new Error('--tenant must contain at least one letter or number');
  return result;
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/** @param {number} index */
const serial = (index) => String(index + 1).padStart(6, '0');

/** @param {unknown} value */
function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|token|authorization|cookie|secret/i.test(key) ? '[REDACTED]' : redact(item),
  ]));
}

/** @param {unknown} value */
function snippet(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(redact(value));
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** @param {string} token */
function decodeClaims(token) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Login returned an invalid access token');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Could not decode access-token claims');
  }
}

/** @param {Headers} headers @param {number} attempt */
function backoffMs(headers, attempt) {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1_000));
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.min(60_000, Math.max(0, dateDelay));
  }
  const exponential = Math.min(30_000, 500 * (2 ** attempt));
  return exponential + Math.floor(Math.random() * Math.min(1_000, exponential / 2));
}

/** @param {Response} response */
async function responseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

/** @param {unknown} body */
function unwrap(body) {
  if (!body || typeof body !== 'object') return body;
  const value = /** @type {Record<string, any>} */ (body);
  return value.data?.data ?? value.data ?? value;
}

/** @param {unknown} body */
function pickId(body) {
  const value = unwrap(body);
  return value && typeof value === 'object' ? value.id : undefined;
}

/** @param {unknown} body */
function rowsOf(body) {
  const value = unwrap(body);
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'items', 'records', 'results']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

/**
 * @param {SeedConfig} config
 * @param {() => string} token
 */
function createHttpClient(config, token) {
  return async function request(path, options = {}) {
    const method = options.method ?? 'GET';
    const url = new URL(path, `${config.base}/`);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      /** @type {Response | undefined} */
      let response;
      try {
        response = await fetch(url, {
          method,
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            accept: 'application/json',
            'user-agent': 'nexus-volume-seed/1.0',
            ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(token() ? { authorization: `Bearer ${token()}` } : {}),
            ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch (error) {
        if (options.retryTransient === false || attempt === MAX_RETRIES) {
          return { ok: false, status: 0, body: { networkError: String(error) }, headers: new Headers() };
        }
        const delay = backoffMs(new Headers(), attempt);
        console.warn(`  ! network retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (${method} ${url.pathname})`);
        await sleep(delay);
        continue;
      }

      const body = await responseBody(response);
      const retryable = response.status === 429 ||
        (options.retryTransient !== false && [502, 503, 504].includes(response.status));
      if (!retryable || attempt === MAX_RETRIES) {
        return { ok: response.ok, status: response.status, body, headers: response.headers };
      }

      const delay = backoffMs(response.headers, attempt);
      console.warn(`  ! HTTP ${response.status}; backing off ${delay}ms (${attempt + 1}/${MAX_RETRIES}, ${method} ${url.pathname})`);
      await sleep(delay);
    }

    throw new Error('unreachable request retry state');
  };
}

/** @param {string} stateFile */
async function readCheckpoint(stateFile) {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw new Error(`Cannot read checkpoint ${stateFile}: ${String(error)}`);
  }
}

/**
 * @param {string} stateFile
 * @param {Record<string, any>} state
 */
async function writeCheckpoint(stateFile, state) {
  await mkdir(dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  const snapshot = JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2);
  await writeFile(temporary, `${snapshot}\n`, { mode: 0o600 });
  await rename(temporary, stateFile);
}

/** @param {number} index @param {string} kind @param {string} tenantSlug */
function marker(kind, index, tenantSlug) {
  return {
    source: 'volume-seed',
    tenant: tenantSlug,
    key: `${kind}:${serial(index)}`,
    schemaVersion: 1,
  };
}

/** @param {number} index @param {SeedConfig} config @param {string} ownerId */
function accountPayload(index, config, ownerId) {
  const id = serial(index);
  const industry = INDUSTRIES[index % INDUSTRIES.length];
  const [city, country] = CITIES[index % CITIES.length];
  const domain = `account-${id}.${config.tenantSlug}.volume-seed.example`;
  return {
    name: `${config.tenant} — ${industry} Account ${id}`,
    code: `VOL-${config.tenantSlug.slice(0, 24)}-A-${id}`,
    ownerId,
    industry,
    type: ['PROSPECT', 'CUSTOMER', 'PARTNER'][index % 3],
    tier: ['SMB', 'MID_MARKET', 'ENTERPRISE', 'STRATEGIC'][index % 4],
    website: `https://${domain}`,
    email: `operations@${domain}`,
    phone: `+1-555-${String(index % 1_000).padStart(3, '0')}-${String((index * 37) % 10_000).padStart(4, '0')}`,
    annualRevenue: 500_000 + (index % 800) * 125_000,
    employeeCount: 15 + (index % 10_000),
    city,
    country,
    currency: 'USD',
    description: `[volume-seed] Deterministic ${industry.toLowerCase()} account for capacity testing.`,
    tags: ['volume-seed', `volume-seed:${config.tenantSlug}`],
    customFields: { volumeSeed: marker('account', index, config.tenantSlug) },
  };
}

/** @param {number} index @param {SeedConfig} config @param {string} ownerId @param {string} accountId */
function contactPayload(index, config, ownerId, accountId) {
  const id = serial(index);
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  const [city, country] = CITIES[index % CITIES.length];
  return {
    firstName,
    lastName: `${lastName}-${id}`,
    ownerId,
    accountId,
    email: `contact-${id}@${config.tenantSlug}.volume-seed.example`,
    phone: `+1-555-${String((index + 100) % 1_000).padStart(3, '0')}-${String((index * 53) % 10_000).padStart(4, '0')}`,
    jobTitle: JOB_TITLES[index % JOB_TITLES.length],
    department: ['Executive', 'Sales', 'Finance', 'Operations', 'IT'][index % 5],
    city,
    country,
    preferredChannel: ['EMAIL', 'PHONE', 'MEETING'][index % 3],
    tags: ['volume-seed', `volume-seed:${config.tenantSlug}`],
    customFields: { volumeSeed: marker('contact', index, config.tenantSlug) },
  };
}

/**
 * @param {number} index
 * @param {SeedConfig} config
 * @param {string} ownerId
 * @param {string} accountId
 * @param {string | undefined} contactId
 * @param {{pipelineId: string, stages: Array<{id: string, probability?: number, isWon?: boolean, isLost?: boolean}>}} pipeline
 */
function dealPayload(index, config, ownerId, accountId, contactId, pipeline) {
  const id = serial(index);
  const stage = pipeline.stages[index % pipeline.stages.length];
  const closed = Boolean(stage.isWon || stage.isLost);
  const days = closed ? -(index % 90) : 14 + (index % 180);
  return {
    name: `${config.tenant} — ${DEAL_NOUNS[index % DEAL_NOUNS.length]} ${id}`,
    accountId,
    pipelineId: pipeline.pipelineId,
    stageId: stage.id,
    ownerId,
    amount: 5_000 + (index % 500) * 1_250,
    currency: 'USD',
    probability: Number.isFinite(stage.probability) ? stage.probability : 20 + (index % 70),
    expectedCloseDate: new Date(Date.now() + days * 86_400_000).toISOString(),
    source: 'volume-seed',
    contactIds: contactId ? [contactId] : [],
    tags: ['volume-seed', `volume-seed:${config.tenantSlug}`],
    customFields: { volumeSeed: marker('deal', index, config.tenantSlug) },
  };
}

/** @param {number} index @param {SeedConfig} config @param {string} ownerId @param {string | undefined} dealId @param {string | undefined} accountId */
function activityPayload(index, config, ownerId, dealId, accountId) {
  const id = serial(index);
  const type = ACTIVITY_TYPES[index % ACTIVITY_TYPES.length];
  const days = (index % 120) - 30;
  return {
    type,
    subject: `[Volume ${id}] ${type.replace('_', ' ').toLowerCase()} follow-up`,
    description: '[volume-seed] Capacity-test activity generated through the CRM API.',
    priority: ['LOW', 'NORMAL', 'NORMAL', 'HIGH'][index % 4],
    ownerId,
    ...(dealId ? { dealId } : { accountId }),
    ...(['CALL', 'MEETING'].includes(type) ? {
      dueDate: new Date(Date.now() + days * 86_400_000).toISOString(),
      duration: 15 + (index % 6) * 15,
    } : {}),
    customFields: { volumeSeed: marker('activity', index, config.tenantSlug) },
  };
}

async function main() {
  let config;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${/** @type {Error} */ (error).message}\n\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (config.help === true) {
    console.log(usage());
    return;
  }
  if (config.concurrency < 1) throw new Error('--concurrency must be between 1 and 50');
  if (config.accounts === 0 && (config.contacts > 0 || config.deals > 0 || config.activities > 0)) {
    throw new Error('At least one account is required when seeding contacts, deals, or activities');
  }

  let accessToken = '';
  const request = createHttpClient(config, () => accessToken);
  console.log('═══ Nexus CRM volume seed ═══');
  console.log(`Base:        ${config.base}`);
  console.log(`Tenant name: ${config.tenant}`);
  console.log(`Targets:     ${config.accounts} accounts, ${config.contacts} contacts, ${config.deals} deals, ${config.activities} activities`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Checkpoint:  ${config.stateFile}`);

  const login = await request('/bff/auth/auth/login', {
    method: 'POST',
    body: { email: config.email, password: config.password },
  });
  if (!login.ok) throw new Error(`Login failed [${login.status}]: ${snippet(login.body)}`);
  const session = unwrap(login.body);
  if (session?.mfaRequired) throw new Error('Login requires MFA; non-interactive volume seeding is not supported');
  accessToken = session?.accessToken;
  if (!accessToken) throw new Error('Login succeeded without an access token');
  const claims = decodeClaims(accessToken);
  const ownerId = claims.sub ?? claims.userId;
  const tenantId = claims.tenantId;
  if (!ownerId || !tenantId) throw new Error('Access token is missing sub/userId or tenantId claims');
  console.log(`Authenticated tenant ID: ${tenantId}`);

  const existing = await readCheckpoint(config.stateFile);
  if (existing && (existing.tenantId !== tenantId || existing.tenantName !== config.tenant || existing.base !== config.base)) {
    throw new Error('Checkpoint target does not match --base/--tenant or the authenticated tenant ID; use another --state-file');
  }
  /** @type {Record<string, any>} */
  const state = existing ?? {
    version: 1,
    createdAt: new Date().toISOString(),
    base: config.base,
    tenantName: config.tenant,
    tenantId,
    targets: {},
    pipeline: null,
    ids: { accounts: [], contacts: [], deals: [], activities: [] },
  };
  state.targets = {
    accounts: config.accounts,
    contacts: config.contacts,
    deals: config.deals,
    activities: config.activities,
  };
  state.ids ??= { accounts: [], contacts: [], deals: [], activities: [] };
  for (const key of ['accounts', 'contacts', 'deals', 'activities']) state.ids[key] ??= [];

  let checkpointChain = Promise.resolve();
  const queueCheckpoint = () => {
    checkpointChain = checkpointChain.then(() => writeCheckpoint(config.stateFile, state));
    return checkpointChain;
  };
  await queueCheckpoint();

  let pipeline = { pipelineId: '', stages: [] };
  if (config.deals > 0) {
    const pipelineList = await request('/bff/crm/pipelines');
    let pipelines = pipelineList.ok ? rowsOf(pipelineList.body) : [];
    if (!pipelines.length) {
      const created = await request('/bff/crm/pipelines', {
        method: 'POST',
        idempotencyKey: `volume-seed:${tenantId}:pipeline`,
        retryTransient: false,
        body: {
          name: `Volume Seed — ${config.tenant}`,
          type: 'sales',
          currency: 'USD',
          isDefault: false,
          isActive: true,
          description: '[volume-seed] Pipeline created for capacity data.',
          stages: [
            { name: 'Prospecting', order: 0, position: 0, probability: 10, isWon: false, isLost: false },
            { name: 'Qualification', order: 1, position: 1, probability: 30, isWon: false, isLost: false },
            { name: 'Proposal', order: 2, position: 2, probability: 55, isWon: false, isLost: false },
            { name: 'Negotiation', order: 3, position: 3, probability: 80, isWon: false, isLost: false },
            { name: 'Closed Won', order: 4, position: 4, probability: 100, isWon: true, isLost: false },
            { name: 'Closed Lost', order: 5, position: 5, probability: 0, isWon: false, isLost: true },
          ],
        },
      });
      if (!created.ok) throw new Error(`No pipeline exists and pipeline creation failed [${created.status}]: ${snippet(created.body)}`);
      pipelines = [unwrap(created.body)];
    }
    const selectedPipeline = pipelines.find((item) => item?.isDefault) ?? pipelines[0];
    pipeline = {
      pipelineId: selectedPipeline?.id,
      stages: Array.isArray(selectedPipeline?.stages) ? selectedPipeline.stages : [],
    };
    if (!pipeline.pipelineId || !pipeline.stages.length) throw new Error('Selected pipeline has no ID or stages; deals cannot be seeded');
    state.pipeline = pipeline;
    await queueCheckpoint();
  }

  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    console.warn('\nInterrupt received; finishing in-flight requests and saving the checkpoint…');
  });

  let totalFailures = 0;
  /**
   * @param {'accounts'|'contacts'|'deals'|'activities'} name
   * @param {number} target
   * @param {(index: number) => Promise<{path: string, body: Record<string, unknown>} | null>} build
   */
  async function runPhase(name, target, build) {
    const ids = state.ids[name];
    const pending = Array.from({ length: target }, (_, index) => index).filter((index) => !ids[index]);
    let cursor = 0;
    let processed = target - pending.length;
    let created = 0;
    let failures = 0;
    let lastReported = -1;
    const started = Date.now();

    const report = () => {
      if (processed === lastReported) return;
      lastReported = processed;
      const elapsed = Math.max(1, (Date.now() - started) / 1_000);
      console.log(`  ${name.padEnd(10)} ${processed}/${target} (${created} new, ${failures} failed, ${(created / elapsed).toFixed(1)}/s)`);
    };
    console.log(`\n[${name}] ${pending.length ? `${pending.length} pending` : 'already complete'}`);
    report();
    const timer = setInterval(report, PROGRESS_EVERY_MS);
    timer.unref();

    async function worker() {
      while (!interrupted) {
        const position = cursor++;
        if (position >= pending.length) return;
        const index = pending[position];
        try {
          const record = await build(index);
          if (!record) throw new Error('No valid parent record is available');
          const result = await request(record.path, {
            method: 'POST',
            body: record.body,
            idempotencyKey: `volume-seed:${tenantId}:${name}:${index}`,
            // CRM accounts/contacts/deals persist idempotency keys. Activities
            // currently do not, so never replay an ambiguous network/5xx result
            // for that endpoint; 429 responses remain safe to retry.
            retryTransient: name !== 'activities',
          });
          const id = result.ok ? pickId(result.body) : undefined;
          if (!result.ok || !id) {
            throw new Error(`HTTP ${result.status}: ${snippet(result.body)}`);
          }
          ids[index] = id;
          created += 1;
          if (created % CHECKPOINT_EVERY === 0) await queueCheckpoint();
        } catch (error) {
          failures += 1;
          if (failures <= 20) console.warn(`  ✗ ${name}[${index}] ${/** @type {Error} */ (error).message}`);
          if (failures === 21) console.warn('  ! further per-record failure messages suppressed');
        } finally {
          processed += 1;
          if (processed % 100 === 0 || processed === target) report();
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(config.concurrency, pending.length) }, () => worker()));
    } finally {
      clearInterval(timer);
      await queueCheckpoint();
      report();
    }
    totalFailures += failures;
    if (interrupted) throw new Error('Seed interrupted; rerun the same command to resume');
  }

  await runPhase('accounts', config.accounts, async (index) => ({
    path: '/bff/crm/accounts',
    body: accountPayload(index, config, ownerId),
  }));

  const accountIds = state.ids.accounts.slice(0, config.accounts).filter(Boolean);
  await runPhase('contacts', config.contacts, async (index) => {
    if (!accountIds.length) return null;
    return {
      path: '/bff/crm/contacts',
      body: contactPayload(index, config, ownerId, accountIds[index % accountIds.length]),
    };
  });

  const contactIds = state.ids.contacts.slice(0, config.contacts).filter(Boolean);
  await runPhase('deals', config.deals, async (index) => {
    if (!accountIds.length) return null;
    return {
      path: '/bff/crm/deals',
      body: dealPayload(
        index,
        config,
        ownerId,
        accountIds[index % accountIds.length],
        contactIds.length ? contactIds[index % contactIds.length] : undefined,
        pipeline
      ),
    };
  });

  const dealIds = state.ids.deals.slice(0, config.deals).filter(Boolean);
  await runPhase('activities', config.activities, async (index) => {
    if (!dealIds.length && !accountIds.length) return null;
    return {
      path: '/bff/crm/activities',
      body: activityPayload(
        index,
        config,
        ownerId,
        dealIds.length ? dealIds[index % dealIds.length] : undefined,
        accountIds.length ? accountIds[index % accountIds.length] : undefined
      ),
    };
  });

  console.log('\n═══ Volume seed summary ═══');
  for (const name of ['accounts', 'contacts', 'deals', 'activities']) {
    const complete = state.ids[name].slice(0, state.targets[name]).filter(Boolean).length;
    console.log(`${name.padEnd(12)} ${complete}/${state.targets[name]}`);
  }
  console.log(`failures     ${totalFailures}`);
  console.log(`checkpoint   ${config.stateFile}`);
  if (totalFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nFATAL: ${/** @type {Error} */ (error).message}`);
  process.exitCode = process.exitCode || 1;
});
