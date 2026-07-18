import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Runtime WCAG 2.0 A/AA accessibility gate.
 *
 * Injects axe-core into the real, running web app (built + served by the
 * Playwright `webServer` in playwright.config.ts) and asserts that a set of
 * key routes have zero WCAG 2 A/AA violations. This complements the static
 * `eslint-plugin-jsx-a11y` lint gate: axe catches issues that only exist in
 * the rendered DOM (color contrast, ARIA wiring, focus order, computed roles),
 * which linting cannot see.
 *
 * Auth: the app has real route-gating middleware (src/middleware.ts) that
 * redirects unauthenticated requests to /login. Rather than drive the full
 * login form (which the existing e2e specs also side-step), we plant the exact
 * cookies the middleware inspects — `nexus_session` (proves a session) and
 * `nexus_onboarded` (skips the first-run onboarding redirect). This is the
 * lightweight, storage-state-style fixture used to reach the authenticated
 * surfaces; it works identically against `next dev` and a production
 * `next build && next start`, since the app serves its own mock API routes and
 * needs no external backend.
 */

// WCAG 2.0 Level A and AA. This is the required conformance bar.
const WCAG_TAGS = ['wcag2a', 'wcag2aa'] as const;

/**
 * Documented allowlist of axe rule IDs to skip.
 *
 * Keep this EMPTY. Only add a rule here when it is a confirmed false positive
 * or a third-party/embedded widget we do not control, with a one-line reason.
 * Every entry weakens the gate, so prefer fixing the underlying markup.
 */
const DISABLED_RULES: string[] = [
  // (intentionally empty)
];

/** Cookies the middleware checks to admit a request to an authenticated route. */
const AUTH_COOKIES = [
  { name: 'nexus_session', value: 'e2e-a11y', path: '/' },
  { name: 'nexus_onboarded', value: '1', path: '/' },
];

async function runAxe(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });

  const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  if (DISABLED_RULES.length > 0) {
    builder.disableRules(DISABLED_RULES);
  }
  const results = await builder.analyze();

  // Emit actionable detail for every violation so CI logs point straight at
  // the offending rule, the help URL, and the specific DOM nodes.
  if (results.violations.length > 0) {
    const report = results.violations
      .map((v) => {
        const nodes = v.nodes
          .map((n) => `      - ${n.target.join(' ')}\n        ${n.failureSummary?.replace(/\n/g, '\n        ')}`)
          .join('\n');
        return `  [${v.impact ?? 'n/a'}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${nodes}`;
      })
      .join('\n\n');
    console.error(`\naxe violations on ${route} (${results.violations.length}):\n${report}\n`);
  }

  expect(
    results.violations,
    `WCAG 2 A/AA violations found on ${route}. See the logged report above for rule IDs, help URLs, and DOM nodes.`,
  ).toEqual([]);
}

test.describe('Accessibility (axe runtime, WCAG 2 A/AA)', () => {
  // Public surface — reachable with no session.
  test('login page has no WCAG A/AA violations', async ({ page }) => {
    await runAxe(page, '/login');
  });

  // Authenticated surfaces — gated behind the middleware cookie fixture.
  test.describe('authenticated surfaces', () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies(
        AUTH_COOKIES.map((c) => ({ ...c, url: 'http://localhost:3000' })),
      );
    });

    test('dashboard has no WCAG A/AA violations', async ({ page }) => {
      await runAxe(page, '/dashboard');
    });

    test('deals list has no WCAG A/AA violations', async ({ page }) => {
      await runAxe(page, '/deals');
    });

    test('settings (Setup) landing has no WCAG A/AA violations', async ({ page }) => {
      await runAxe(page, '/settings');
    });
  });
});
