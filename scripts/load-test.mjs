#!/usr/bin/env node
// @ts-check

/**
 * Dependency-free staged Nexus CRM load test.
 *
 * Each virtual user authenticates exactly once, retains its bearer/cookies, and
 * is reused by later stages. The harness never logs credentials or tokens and
 * trips a 20% error-rate circuit breaker before advancing to a larger stage.
 *
 * Example (DO NOT point at an environment without explicit authorization):
 *   node scripts/load-test.mjs --base https://crm.example.com \
 *     --email load@example.com --password '...' --duration-per-stage 120s
 */

const DEFAULT_DURATION_MS = 120_000;
const DEFAULT_MAX_VUS = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const LOGIN_SPACING_MS = 250;
const ERROR_ABORT_RATE = 0.20;

function usage() {
  return `Nexus CRM staged load test

Required:
  --base URL                     Web origin exposing /bff
  --email EMAIL                  Login email
  --password PASSWORD            Login password (or set NEXUS_PASSWORD)

Options:
  --duration-per-stage DURATION  Per-stage duration (default 120s; supports ms/s/m)
  --max-vus N                    Highest VU stage (default 100, hard maximum 100)
  --help                         Show this help

Stages are 10 → 25 → 50 → 100, clipped to --max-vus. A run aborts immediately
when a statistically meaningful sample or a completed stage exceeds 20% errors.`;
}

/**
 * @typedef {{
 *   help: false,
 *   base: string,
 *   email: string,
 *   password: string,
 *   durationMs: number,
 *   maxVus: number
 * }} LoadConfig
 */

/**
 * @param {string[]} argv
 * @returns {{help: true} | LoadConfig}
 */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const values = {};
  const known = new Set(['base', 'email', 'password', 'duration-per-stage', 'max-vus']);
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
  const baseUrl = new URL(required('base'));
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('--base must use http or https');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('--base must not contain credentials, a query, or a fragment');
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '');

  const maxVusRaw = values['max-vus'] ?? String(DEFAULT_MAX_VUS);
  if (!/^\d+$/.test(maxVusRaw)) throw new Error('--max-vus must be an integer');
  const maxVus = Number(maxVusRaw);
  if (maxVus < 1 || maxVus > 100) throw new Error('--max-vus must be between 1 and 100');

  const password = values.password ?? process.env.NEXUS_PASSWORD;
  if (!password) throw new Error('--password is required (or set NEXUS_PASSWORD)');

  return {
    help: false,
    base: baseUrl.toString().replace(/\/$/, ''),
    email: required('email'),
    password,
    durationMs: parseDuration(values['duration-per-stage'] ?? '120s'),
    maxVus,
  };
}

/** @param {string} value */
function parseDuration(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/i.exec(value.trim());
  if (!match) throw new Error('--duration-per-stage must look like 120s, 2m, or 30000ms');
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = unit === 'm' ? 60_000 : unit === 's' ? 1_000 : 1;
  const result = amount * multiplier;
  if (!Number.isFinite(result) || result < 1_000 || result > 3_600_000) {
    throw new Error('--duration-per-stage must be between 1s and 60m');
  }
  return Math.round(result);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

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
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

/** @param {string} text */
function parseJson(text) {
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
function firstId(body) {
  const value = unwrap(body);
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? value.data ?? value.items ?? value.records ?? value.results ?? []
      : [];
  return Array.isArray(rows) ? rows.find((row) => row?.id)?.id : undefined;
}

/** @param {Headers} headers */
function setCookieValues(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/);
}

/** @param {Map<string, string>} jar @param {Headers} headers */
function mergeCookies(jar, headers) {
  for (const header of setCookieValues(headers)) {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

/** @param {Map<string, string>} jar */
function cookieHeader(jar) {
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ');
}

/** @param {number} seed */
function pseudoRandom(seed) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** @param {number[]} values @param {number} percentile */
function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

/** @param {number} maxVus */
function stagesFor(maxVus) {
  return [...new Set([10, 25, 50, 100].filter((value) => value < maxVus).concat(maxVus))]
    .sort((a, b) => a - b);
}

/**
 * @typedef {{
 *   id: number,
 *   token: string,
 *   cookies: Map<string, string>,
 *   random: () => number,
 *   sequence: number,
 *   recordIds: {deals?: string, contacts?: string, accounts?: string}
 * }} VirtualUser
 */

/**
 * @param {LoadConfig} config
 * @param {number} id
 * @returns {Promise<VirtualUser>}
 */
async function loginVirtualUser(config, id) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${config.base}/bff/auth/auth/login`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'nexus-load-test/1.0',
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
  } catch (error) {
    throw new Error(`VU ${id} login network failure after ${Math.round(performance.now() - started)}ms: ${String(error)}`);
  }
  const body = parseJson(await response.text());
  const session = unwrap(body);
  if (session?.mfaRequired) throw new Error(`VU ${id} requires MFA; load test cannot continue non-interactively`);
  if (!response.ok || !session?.accessToken) {
    throw new Error(`VU ${id} login failed [${response.status}]: ${snippet(body)}`);
  }
  const cookies = new Map();
  mergeCookies(cookies, response.headers);
  return {
    id,
    token: session.accessToken,
    cookies,
    random: pseudoRandom(id * 2_654_435_761),
    sequence: id % 20,
    recordIds: {},
  };
}

/**
 * @param {LoadConfig} config
 * @param {VirtualUser} vu
 * @param {string} path
 */
async function timedRequest(config, vu, path) {
  const started = performance.now();
  try {
    const response = await fetch(`${config.base}${path}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${vu.token}`,
        ...(vu.cookies.size ? { cookie: cookieHeader(vu.cookies) } : {}),
        'cache-control': 'no-cache',
        'user-agent': 'nexus-load-test/1.0',
        'x-load-test-vu': String(vu.id),
      },
    });
    mergeCookies(vu.cookies, response.headers);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: performance.now() - started,
      body: parseJson(text),
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - started,
      body: {},
      error: String(error),
    };
  }
}

// 25% deals, 20% contacts, 20% accounts, 20% record detail, 15% dashboard.
const ACTION_SEQUENCE = [
  'deals', 'contacts', 'accounts', 'detail', 'dashboard',
  'deals', 'contacts', 'accounts', 'detail', 'deals',
  'contacts', 'accounts', 'dashboard', 'detail', 'deals',
  'contacts', 'accounts', 'detail', 'dashboard', 'deals',
];

/**
 * @param {LoadConfig} config
 * @param {VirtualUser} vu
 */
async function executeAction(config, vu) {
  const action = ACTION_SEQUENCE[vu.sequence++ % ACTION_SEQUENCE.length];
  if (action === 'dashboard') {
    return { action, result: await timedRequest(config, vu, '/api/dashboard/stats') };
  }

  if (action === 'detail') {
    const candidates = Object.entries(vu.recordIds).filter((entry) => entry[1]);
    if (candidates.length) {
      const [resource, id] = candidates[Math.floor(vu.random() * candidates.length)];
      return { action, result: await timedRequest(config, vu, `/bff/crm/${resource}/${encodeURIComponent(id)}`) };
    }
    // A fresh VU has no record IDs yet. Warm its deal ID using the same real list API.
    const result = await timedRequest(config, vu, '/bff/crm/deals?page=1&limit=25');
    const id = result.ok ? firstId(result.body) : undefined;
    if (id) vu.recordIds.deals = id;
    return { action: 'deals-warmup', result };
  }

  const page = 1 + Math.floor(vu.random() * 5);
  const result = await timedRequest(config, vu, `/bff/crm/${action}?page=${page}&limit=25`);
  const id = result.ok ? firstId(result.body) : undefined;
  if (id) vu.recordIds[action] = id;
  return { action, result };
}

/** @param {number} stageVus */
function createStageStats(stageVus) {
  return {
    stageVus,
    requests: 0,
    errors: 0,
    latencies: /** @type {number[]} */ ([]),
    statuses: /** @type {Map<number, number>} */ (new Map()),
    actions: /** @type {Map<string, {requests: number, errors: number}>} */ (new Map()),
    aborted: false,
    abortReason: '',
  };
}

/** @param {ReturnType<typeof createStageStats>} stats @param {string} action @param {Awaited<ReturnType<typeof timedRequest>>} result */
function recordResult(stats, action, result) {
  stats.requests += 1;
  stats.latencies.push(result.latencyMs);
  stats.statuses.set(result.status, (stats.statuses.get(result.status) ?? 0) + 1);
  const actionStats = stats.actions.get(action) ?? { requests: 0, errors: 0 };
  actionStats.requests += 1;
  if (!result.ok) {
    stats.errors += 1;
    actionStats.errors += 1;
  }
  stats.actions.set(action, actionStats);

  const minimumSample = Math.max(50, stats.stageVus * 2);
  const errorRate = stats.errors / stats.requests;
  if (stats.requests >= minimumSample && errorRate > ERROR_ABORT_RATE) {
    stats.aborted = true;
    stats.abortReason = `circuit breaker: ${(errorRate * 100).toFixed(2)}% errors after ${stats.requests} requests`;
  }
}

/** @param {ReturnType<typeof createStageStats>} stats @param {number} elapsedMs */
function reportStage(stats, elapsedMs) {
  const errorRate = stats.requests ? stats.errors / stats.requests : 1;
  const statuses = Array.from(stats.statuses).sort(([a], [b]) => a - b)
    .map(([status, count]) => `${status || 'network'}=${count}`).join(', ');
  console.log(`\n--- Stage ${stats.stageVus} VUs ---`);
  console.log(`duration    ${(elapsedMs / 1_000).toFixed(1)}s`);
  console.log(`requests    ${stats.requests}`);
  console.log(`errors      ${stats.errors}`);
  console.log(`error rate  ${(errorRate * 100).toFixed(2)}%`);
  console.log(`p50 latency ${quantile(stats.latencies, 0.50).toFixed(1)}ms`);
  console.log(`p95 latency ${quantile(stats.latencies, 0.95).toFixed(1)}ms`);
  console.log(`statuses    ${statuses || 'none'}`);
  for (const [action, values] of Array.from(stats.actions).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${action.padEnd(14)} ${String(values.requests).padStart(7)} requests  ${String(values.errors).padStart(5)} errors`);
  }
  if (stats.aborted) console.log(`ABORTED: ${stats.abortReason}`);
  return errorRate;
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

  const stages = stagesFor(config.maxVus);
  /** @type {VirtualUser[]} */
  const virtualUsers = [];
  let interrupted = false;
  process.once('SIGINT', () => {
    interrupted = true;
    console.warn('\nInterrupt received; stopping after in-flight requests…');
  });

  console.log('═══ Nexus CRM staged load test ═══');
  console.log(`Base:               ${config.base}`);
  console.log(`Stages:             ${stages.join(' → ')}`);
  console.log(`Duration per stage: ${(config.durationMs / 1_000).toFixed(1)}s`);
  console.log('Session model:      one login per VU, session retained across stages');
  console.log('Circuit breaker:    hard abort above 20% errors');

  for (const target of stages) {
    if (interrupted) break;
    const required = target - virtualUsers.length;
    if (required > 0) {
      console.log(`\nAuthenticating ${required} new VU(s) for the ${target}-VU stage…`);
      // Deliberately serialize and space password hashes; workload concurrency
      // starts only after every new VU owns a stable session.
      for (let offset = 0; offset < required; offset += 1) {
        if (offset > 0 || virtualUsers.length > 0) await sleep(LOGIN_SPACING_MS);
        const vu = await loginVirtualUser(config, virtualUsers.length + 1);
        virtualUsers.push(vu);
        if (virtualUsers.length % 10 === 0 || offset === required - 1) {
          console.log(`  authenticated ${virtualUsers.length}/${target} VUs`);
        }
      }
    }

    const active = virtualUsers.slice(0, target);
    const stats = createStageStats(target);
    const started = Date.now();
    const deadline = started + config.durationMs;
    console.log(`Starting ${target}-VU workload stage…`);

    async function worker(vu) {
      while (!interrupted && !stats.aborted && Date.now() < deadline) {
        const { action, result } = await executeAction(config, vu);
        recordResult(stats, action, result);
        if (!result.ok && stats.errors <= 10) {
          console.warn(`  ! VU ${vu.id} ${action}: ${result.error} (${result.latencyMs.toFixed(1)}ms)`);
        }
        const thinkTime = 300 + Math.floor(vu.random() * 600);
        if (!stats.aborted && Date.now() + thinkTime < deadline) await sleep(thinkTime);
      }
    }

    await Promise.all(active.map((vu) => worker(vu)));
    const errorRate = reportStage(stats, Date.now() - started);
    if (stats.aborted || errorRate > ERROR_ABORT_RATE) {
      console.error(`\nHARD ABORT: ${target}-VU stage exceeded the 20% error-rate safety limit. No larger stage will run.`);
      process.exitCode = 1;
      return;
    }
  }

  if (interrupted) {
    process.exitCode = 130;
    return;
  }
  console.log('\nLoad test completed without tripping the safety limit.');
}

main().catch((error) => {
  console.error(`\nFATAL: ${/** @type {Error} */ (error).message}`);
  process.exitCode = process.exitCode || 1;
});
